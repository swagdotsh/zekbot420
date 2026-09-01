const axios = require('axios');
const { neon } = require('@neondatabase/serverless');
const { EmbedBuilder } = require('discord.js');

const sql = neon(process.env.NEON_DATABASE_URL);
const LASTFM_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_PLACEHOLDER_IMAGE = '2a96cbd8b46e442fc41c2b86b821562f.png';

async function lastFmRequest(method, user, extra = {}) {
    const { data } = await axios.get(LASTFM_URL, {
        params: {
            method,
            user,
            api_key: process.env.LASTFM_API_KEY,
            format: 'json',
            ...extra,
        },
        timeout: 12_000,
    });

    if (data?.error) throw new Error(data.message || `Last.fm error ${data.error}`);
    return data;
}

function toArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function clampField(value, maxLength = 1024) {
    const text = String(value || '*No data yet*');
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function profileImage(user) {
    const image = toArray(user?.image)
        .map((entry) => entry?.['#text'])
        .find((url) => url && !url.includes(LASTFM_PLACEHOLDER_IMAGE));
    return image || null;
}

function formatPlays(value) {
    const plays = Number(value ?? 0);
    return Number.isFinite(plays) ? `${plays.toLocaleString()} plays` : '— plays';
}

function formatArtists(artists) {
    const items = toArray(artists).slice(0, 3);
    if (!items.length) return '*No data yet*';
    return items.map((artist, index) =>
        `**${index + 1}.** ${artist.url ? `[${artist.name}](${artist.url})` : artist.name} • ${formatPlays(artist.playcount)}`
    ).join('\n');
}

function formatAlbums(albums) {
    const items = toArray(albums).slice(0, 3);
    if (!items.length) return '*No data yet*';
    return items.map((album, index) => {
        const title = album.url ? `[${album.name}](${album.url})` : album.name;
        return `**${index + 1}.** ${title} — *${album.artist?.name || 'Unknown artist'}* • ${formatPlays(album.playcount)}`;
    }).join('\n');
}

function formatTracks(tracks) {
    const items = toArray(tracks).slice(0, 3);
    if (!items.length) return '*No data yet*';
    return items.map((track, index) => {
        const title = track.url ? `[${track.name}](${track.url})` : track.name;
        return `**${index + 1}.** ${title} — *${track.artist?.name || 'Unknown artist'}* • ${formatPlays(track.playcount)}`;
    }).join('\n');
}

function formatTags(tags) {
    const items = toArray(tags).slice(0, 3);
    if (!items.length) return '*No data yet*';
    return items.map((tag, index) =>
        `**${index + 1}.** ${tag.url ? `[${tag.name}](${tag.url})` : tag.name}`
    ).join(' • ');
}

function formatRecentTrack(track) {
    if (!track) return { name: '🕘 Last played', value: '*No recent tracks found*' };

    const nowPlaying = track['@attr']?.nowplaying === 'true';
    const title = track.url ? `[${track.name}](${track.url})` : track.name;
    const artist = track.artist?.['#text'] || track.artist?.name || 'Unknown artist';
    const album = track.album?.['#text'] || '';

    return {
        name: nowPlaying ? '🎧 Listening to' : '🕘 Last played',
        value: clampField(`**${title}** — *${artist}*${album ? `\n${album}` : ''}`),
        inline: false,
    };
}

module.exports = {
    name: 'fmprofile',
    aliases: ['lastfmprofile', 'fmprof'],

    async execute(message) {
        if (!process.env.LASTFM_API_KEY) {
            return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');
        }

        const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`;
        const username = rows[0]?.lastfm_username;

        if (!username) {
            return message.reply('Link your Last.fm account first with `,linklastfm`.');
        }

        try {
            await message.channel.sendTyping();

            const [profileData, recentData, artistsAllTime, artistsWeek, albumsAllTime, albumsWeek, tracksAllTime, tracksWeek, tagsData] = await Promise.all([
                lastFmRequest('user.getInfo', username),
                lastFmRequest('user.getRecentTracks', username, { limit: 1 }),
                lastFmRequest('user.getTopArtists', username, { period: 'overall', limit: 3 }),
                lastFmRequest('user.getTopArtists', username, { period: '7day', limit: 3 }),
                lastFmRequest('user.getTopAlbums', username, { period: 'overall', limit: 3 }),
                lastFmRequest('user.getTopAlbums', username, { period: '7day', limit: 3 }),
                lastFmRequest('user.getTopTracks', username, { period: 'overall', limit: 3 }),
                lastFmRequest('user.getTopTracks', username, { period: '7day', limit: 3 }),
                lastFmRequest('user.getTopTags', username, { limit: 3 }),
            ]);

            const profile = profileData.user ?? {};
            const recentTrack = toArray(recentData?.recenttracks?.track)[0];
            const thumbnail = profileImage(profile) || message.author.displayAvatarURL({ extension: 'png', size: 512 });

            const embed = new EmbedBuilder()
                .setColor(0xd51007)
                .setAuthor({
                    name: `${profile.name || username}'s Last.fm profile`,
                    iconURL: thumbnail,
                    url: profile.url || undefined,
                })
                .setThumbnail(thumbnail)
                .addFields(
                    formatRecentTrack(recentTrack),
                    { name: '🎤 Top artists — all-time', value: clampField(formatArtists(artistsAllTime?.topartists?.artist)), inline: true },
                    { name: '🎤 Top artists — past 7 days', value: clampField(formatArtists(artistsWeek?.topartists?.artist)), inline: true },
                    { name: '💿 Top albums — all-time', value: clampField(formatAlbums(albumsAllTime?.topalbums?.album)), inline: true },
                    { name: '💿 Top albums — past 7 days', value: clampField(formatAlbums(albumsWeek?.topalbums?.album)), inline: true },
                    { name: '🎵 Top tracks — all-time', value: clampField(formatTracks(tracksAllTime?.toptracks?.track)), inline: true },
                    { name: '🎵 Top tracks — past 7 days', value: clampField(formatTracks(tracksWeek?.toptracks?.track)), inline: true },
                    { name: '🏷️ Top genres / tags — all-time', value: clampField(formatTags(tagsData?.toptags?.tag)), inline: false },
                )
                .setFooter({ text: `Last.fm • ${username}${profile.playcount ? ` • ${Number(profile.playcount).toLocaleString()} total scrobbles` : ''}` });

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Last.fm profile error:', error.response?.data || error.message);
            return message.reply('Couldn’t load that Last.fm profile right now. Please try again in a moment.');
        }
    },
};
