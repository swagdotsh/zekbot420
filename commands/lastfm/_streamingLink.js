const { currentPrefix } = require('../../prefix');

const { sql } = require('../../db');
const { findOnAppleMusic, findOnSpotify } = require('../../musicLinks');
const { fail } = require('../../ui');

const SERVICES = {
    apple: { label: 'Apple Music', emoji: '🍎', find: findOnAppleMusic },
    spotify: { label: 'Spotify', emoji: '🟢', find: findOnSpotify },
};

async function linkedUsername(discordId) {
    const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${discordId}`;
    return rows[0]?.lastfm_username ?? null;
}

async function resolveLastfmUser(message, args) {
    const mentioned = message.mentions.users.first();
    if (mentioned) {
        const username = await linkedUsername(mentioned.id);
        return username ? { username } : { error: `${mentioned.username} hasn't linked a Last.fm account.` };
    }
    if (args[0]) return { username: args[0] };

    const username = await linkedUsername(message.author.id);
    return username
        ? { username }
        : { error: `Link your Last.fm with \`${currentPrefix()}fm connect\`, or give a username: \`${currentPrefix()}${message.commandName ?? 'am'} <username>\`` };
}

async function getCurrentTrack(username) {
    const params = new URLSearchParams({
        method: 'user.getRecentTracks', user: username, api_key: process.env.LASTFM_API_KEY, format: 'json', limit: '1',
    });
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { signal: AbortSignal.timeout(10000) });
    const data = await response.json().catch(() => null);
    if (data?.error === 6) return { error: `There's no Last.fm user named **${username}**.` };
    if (data?.error === 17) return { error: `**${username}** keeps their recent listening private on Last.fm.` };
    if (data?.error === 8) return { error: `Last.fm couldn't load **${username}**'s recent tracks. They may have no scrobbles yet, or Last.fm is having trouble.` };
    if (!response.ok || !data?.recenttracks) throw new Error(`Last.fm HTTP ${response.status}`);

    const list = data.recenttracks.track;
    const track = Array.isArray(list) ? list[0] : list;
    if (!track) return { error: `**${username}** hasn't scrobbled anything yet.` };

    return {
        track: track.name,
        artist: track.artist?.['#text'] ?? track.artist?.name ?? '',
        album: track.album?.['#text'] || null,
        nowPlaying: track['@attr']?.nowplaying === 'true',
    };
}

async function sendStreamingLink(message, args, serviceKey, commandName) {
    const service = SERVICES[serviceKey];
    message.commandName = commandName;
    if (!process.env.LASTFM_API_KEY) return message.reply(fail('Last.fm isn\'t set up on this bot.'));

    await message.channel.sendTyping().catch(() => {});

    let user;
    try {
        user = await resolveLastfmUser(message, args);
    } catch (error) {
        console.error(`[${commandName}] Last.fm account lookup failed:`, error.message);
        return message.reply(fail(`I couldn't look up your linked Last.fm account right now. Try \`${currentPrefix()}${commandName} <lastfm username>\`.`));
    }
    if (user.error) return message.reply(fail(user.error));

    try {
        const playing = await getCurrentTrack(user.username);
        if (playing.error) return message.reply(fail(playing.error));

        const result = await service.find(playing);
        const what = `**${playing.track}** by **${playing.artist}**`;
        const when = playing.nowPlaying ? 'Now playing' : 'Last played';

        if (!result) {
            return message.reply({ content: fail(`${when}: ${what}, but I couldn't find it on ${service.label}.`), allowedMentions: { repliedUser: false } });
        }
        if (result.exact === false) {
            return message.reply({
                content: `${service.emoji} ${when}: ${what}\n${result.url}\n-# Exact Spotify links need Spotify API keys on this bot, so this is a search link.`,
                allowedMentions: { repliedUser: false },
            });
        }
        return message.reply({ content: `${service.emoji} ${when}: ${what}\n${result.url}`, allowedMentions: { repliedUser: false } });
    } catch (error) {
        console.error(`[${commandName}]`, error.message);
        return message.reply(fail(`Couldn't reach Last.fm or ${service.label} right now. Try again in a moment.`));
    }
}

module.exports = { sendStreamingLink, getCurrentTrack };
