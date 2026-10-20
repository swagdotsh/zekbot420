const { PermissionsBitField } = require('discord.js');
const { getOrCreateSession, playNext, cleanupTrack } = require('../../musicPlayer');
const spotify = require('../../spotify');
const {
    SOURCE_NAMES,
    SOURCE_LABELS,
    SOURCE_EMOJIS,
    MAX_TRACK_DURATION_SEC,
    MAX_UPLOAD_BYTES,
    formatDuration,
    detectSource,
    getYtDlpTrack,
    getUploadTrack,
    getSpotifyTracks,
} = require('../../musicSources');

const SMIRK = '<:smirk2:1498272372539785286>';

function usage() {
    const p = process.env.PREFIX;
    return `Usage:\n\`${p}play <search or link>\` • \`${p}play source=sc|yt|sp <search or link>\` • \`${p}play\` with an audio file attached\n-# Plain searches use Spotify, then YouTube if Spotify has nothing. Links from YouTube, SoundCloud and Spotify are detected automatically.`;
}

function trackName(track) {
    return track.sourceType === 'local' ? track.attachment.name : `${track.title} - ${track.uploader}`;
}

function durationText(track) {
    return track.durationRaw && track.durationRaw !== 'Unknown' ? ` \`${track.durationRaw}\`` : '';
}

function parseArgs(args, forcedSource) {
    let source = forcedSource ?? null;
    const rest = [];

    for (const arg of args) {
        const match = arg.match(/^(?:source|src)=(\w+)$/i);
        if (!match) {
            rest.push(arg);
            continue;
        }

        source = SOURCE_NAMES[match[1].toLowerCase()];
        if (!source) return { error: `Unknown source \`${match[1]}\`. Use \`yt\`, \`sc\`, \`sp\` or \`file\`.` };
    }

    return { source, query: rest.join(' ').trim() };
}

function looksLikeMatch(track, query) {
    const normalize = text => text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const found = normalize(`${track.uploader} ${track.title}`);
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const hits = words.filter(word => found.includes(word)).length;
    return hits / words.length >= 0.5;
}

async function findTracks(message, source, query, fallbackToYoutube = false) {
    if (source === 'local') {
        const attachment = message.attachments.first();
        if (!attachment) return { error: `Attach an audio file to play it. ${SMIRK}` };

        const track = await getUploadTrack(attachment, message.guild.id);
        if (!track) return { error: `That file is too big. Uploads can be up to **${MAX_UPLOAD_BYTES / 1024 / 1024} MB**. ${SMIRK}` };
        return { tracks: [track], name: null, total: 1, skipped: 0 };
    }

    if (source === 'spotify') {
        if (!spotify.isConfigured()) {
            return { error: `Spotify isn't set up on this bot yet. The bot owner needs to add \`SPOTIFY_CLIENT_ID\` and \`SPOTIFY_CLIENT_SECRET\` to the .env. ${SMIRK}` };
        }

        const result = fallbackToYoutube
            ? await getSpotifyTracks(query).catch((err) => {
                console.error('Spotify search failed, using YouTube instead:', err.message);
                return null;
            })
            : await getSpotifyTracks(query);

        const trusted = result?.tracks.length && (!fallbackToYoutube || looksLikeMatch(result.tracks[0], query));
        if (!trusted) {
            if (fallbackToYoutube) return findTracks(message, 'youtube', query);
            return { error: `Nothing found on Spotify for that. ${SMIRK}` };
        }

        const tracks = result.tracks.filter(t => t.duration <= MAX_TRACK_DURATION_SEC);
        return { tracks, name: result.name, total: result.total, skipped: result.tracks.length - tracks.length };
    }

    const track = await getYtDlpTrack(query, source);
    if (!track?.url) return { error: `No ${SOURCE_LABELS[source]} track found. ${SMIRK}` };
    return { tracks: [track], name: null, total: 1, skipped: 0 };
}

function spotifyErrorText(err) {
    if (err.code === 'SPOTIFY_NEEDS_LOGIN') {
        return `Spotify playlists aren't set up on this bot yet, but tracks and albums work. The bot owner needs to run \`node spotify-auth.js\`. ${SMIRK}`;
    }
    if (err.code === 'SPOTIFY_LOGIN_EXPIRED') {
        return `The bot's Spotify login stopped working, the bot owner needs to run \`node spotify-auth.js\` again. ${SMIRK}`;
    }
    if (err.code === 'SPOTIFY_BAD_KEYS') return `Spotify rejected the bot's keys, the bot owner should check them. ${SMIRK}`;
    if (err.status === 404) {
        return `Spotify couldn't find that. If it's a playlist, it might be private or made by Spotify itself (new apps can't read Spotify's own playlists like Today's Top Hits). ${SMIRK}`;
    }
    if (err.status === 400 || err.status === 401) return `Spotify rejected the bot's login, the bot owner should check the Spotify keys. ${SMIRK}`;
    return null;
}

module.exports = {
    name: 'play',

    async execute(message, args, forcedSource) {
        const parsed = parseArgs(args, forcedSource);
        if (parsed.error) return message.reply(parsed.error);

        let { source, query } = parsed;
        const hasAttachment = message.attachments.size > 0;

        const linkSource = detectSource(query);
        if (linkSource === 'unsupported') return message.reply(`I can only play YouTube, SoundCloud and Spotify links. ${SMIRK}`);
        if (linkSource) source = linkSource;

        const isDefaultSearch = !source && !linkSource && Boolean(query);
        if (!source) source = hasAttachment && !query ? 'local' : query ? (spotify.isConfigured() ? 'spotify' : 'youtube') : null;
        if (!source || (source !== 'local' && !query)) return message.reply(usage());

        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) return message.reply(`You're currently not in a VC. ${SMIRK}`);

        const me = message.guild.members.me;
        const perms = voiceChannel.permissionsFor(me);
        if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
            return message.reply(`I need **Connect** and **Speak** permissions in your voice channel. ${SMIRK}`);
        }

        if (message.client.voiceSessions?.get(message.guild.id)?.mode === 'tts') {
            return message.reply(`I'm in TTS mode right now. Use \`${process.env.PREFIX}leave\` first. ${SMIRK}`);
        }

        const status = await message.reply(`${SOURCE_EMOJIS[source]} ${source === 'local' ? 'Loading your file...' : `Searching ${SOURCE_LABELS[source]}...`}`);

        try {
            const found = await findTracks(message, source, query, isDefaultSearch);
            if (found.error) return status.edit(found.error);

            if (!found.tracks.length) {
                return status.edit(`Every track there is longer than **${formatDuration(MAX_TRACK_DURATION_SEC)}**, so there's nothing to queue. ${SMIRK}`);
            }

            const [first] = found.tracks;
            if (found.total === 1 && Number.isFinite(first.duration) && first.duration > MAX_TRACK_DURATION_SEC) {
                cleanupTrack(first);
                return status.edit(`That track is too long. Max length is **${formatDuration(MAX_TRACK_DURATION_SEC)}**, but this one is **${first.durationRaw}**. ${SMIRK}`);
            }

            const session = await getOrCreateSession(message, voiceChannel);
            if (session.mode === 'tts') {
                found.tracks.forEach(cleanupTrack);
                return status.edit(`I'm in TTS mode right now. Use \`${process.env.PREFIX}leave\` first. ${SMIRK}`);
            }

            const requestedBy = message.member?.displayName || message.author.username;
            for (const track of found.tracks) track.requestedBy = requestedBy;

            session.textChannelId = message.channel.id;
            if (session.inactivityTimeout) {
                clearTimeout(session.inactivityTimeout);
                session.inactivityTimeout = null;
            }

            const wasIdle = !session.current;
            const position = session.queue.length + 1;
            session.queue.push(...found.tracks);

            if (wasIdle && !found.name) {
                session.pendingStatusMessage = status;
                await playNext(message.client, message.guild.id);
                return;
            }

            if (wasIdle) await playNext(message.client, message.guild.id);

            if (found.name) {
                const notes = [];
                if (found.total > found.tracks.length + found.skipped) notes.push(`only the first ${spotify.MAX_COLLECTION_TRACKS} are queued`);
                if (found.skipped) notes.push(`skipped ${found.skipped} over ${formatDuration(MAX_TRACK_DURATION_SEC)}`);
                return status.edit(
                    `${SOURCE_EMOJIS.spotify} Queued **${found.tracks.length}** track${found.tracks.length === 1 ? '' : 's'} from **${found.name}**.` +
                    (notes.length ? `\n-# ${notes.join(', ')}` : '')
                );
            }

            return status.edit(`${SOURCE_EMOJIS[first.sourceType]} Queued **${trackName(first)}**${durationText(first)} at position **${position}**.`);
        } catch (err) {
            console.error(`,play (${source}) failed:`, err);

            if (err?.code === 'ENOENT') {
                return status.edit('Could not find `yt-dlp` or `ffmpeg`. Install them or set `YTDLP_PATH` / `FFMPEG_PATH` in your `.env`.');
            }

            return status.edit(spotifyErrorText(err) ?? `I couldn't play that. ${SMIRK}\n-# Check console logs.`);
        }
    },
};
