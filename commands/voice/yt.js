const { getOrCreateSession, playNext } = require('../../musicPlayer');
const { PermissionsBitField } = require('discord.js');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const MAX_TRACK_DURATION_SEC = 7 * 60;

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'Unknown';

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
        return ""+hours+":"+String(minutes).padStart(2, '0')+":"+String(secs).padStart(2, '0');
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function isUrl(input) {
    return /^https?:\/\//i.test(input);
}

function getYtDlpTarget(input) {
    if (isUrl(input)) return input;
    return `ytsearch1:${input}`;
}

async function getTrackInfo(input) {
    const target = getYtDlpTarget(input);

    const { stdout } = await execFileAsync(YTDLP_BIN, [
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        target
    ], {
        maxBuffer: 1024 * 1024 * 10
    });

    const firstJsonLine = stdout
        .split('\n')
        .map(function(line) { return line.trim() })
        .find(Boolean);

    if (!firstJsonLine) return null;

    const info = JSON.parse(firstJsonLine);

    return {
        sourceType: 'youtube',
        title: info.title || 'Unknown title',
        uploader: info.uploader || info.channel || 'Unknown channel',
        url: info.webpage_url || info.original_url || target,
        duration: Number.isFinite(info.duration) ? info.duration : null,
        durationRaw: formatDuration(info.duration),
        thumbnail: info.thumbnail || null,
        requestedBy: null,
        startedAt: null
    };
}

module.exports = {
    name: 'yt',
    aliases: ['youtube'],

    async execute(message, args) {
        try {
            if (!message.client.voiceSessions) {
                message.client.voiceSessions = new Map();
            }

            const query = args.join(' ').trim();
            if (!query) {
                return message.reply('Usage: `,yt <youtube url or search>`');
            }

            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) {
                return message.reply("You're currently not in a VC. <:smirk2:1498272372539785286>");
            }

            const me = message.guild.members.me;
            if (!me) {
                return message.reply('Could not verify bot member state.');
            }

            const perms = voiceChannel.permissionsFor(me);
            if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
                return message.reply('I need **Connect** and **Speak** permissions in your voice channel. <:smirk2:1498272372539785286>');
            }

            const loadingMessage = await message.reply('Searching YouTube...');

            const track = await getTrackInfo(query);
            if (!track?.url) {
                return loadingMessage.edit('No YouTube video found. <:smirk2:1498272372539785286>');
            }

            if (Number.isFinite(track.duration) && track.duration > MAX_TRACK_DURATION_SEC) {
                return loadingMessage.edit(`That video is too long. Max length is **${formatDuration(MAX_TRACK_DURATION_SEC)}**, but this one is **${track.durationRaw}** <:smirk2:1498272372539785286>`);
            }

            track.requestedBy = message.member?.displayName || message.author.username;

            let session = message.client.voiceSessions.get(message.guild.id);

            if (session?.mode === 'tts') {
                return loadingMessage.edit("I'm in TTS mode right now. Use `" + process.env.PREFIX + "leave` first. <:smirk2:1498272372539785286>");
            }

            if (!session) session = await getOrCreateSession(message, voiceChannel);

            session.textChannelId = message.channel.id;

            if (session.inactivityTimeout) {
                clearTimeout(session.inactivityTimeout);
                session.inactivityTimeout = null;
            }

            session.queue.push(track);

            const displayName = `${track.title} - ${track.uploader}`;
            const duration = track.durationRaw !== 'Unknown' ? ` \`${track.durationRaw}\`` : '';

            if (!session.current) {
                await playNext(message.client, message.guild.id);
                return loadingMessage.edit(`Playing now: **${displayName}**${duration}`);
            }

            return loadingMessage.edit(`Queued **${displayName}**${duration} at position **${session.queue.length}**.`);
        } catch (err) {
            console.error('YouTube command failed:', err);

            if (err?.code === 'ENOENT') {
                return message.reply('Could not find `yt-dlp` or `ffmpeg`. Install them or set `YTDLP_PATH` / `FFMPEG_PATH` in your `.env`.');
            }

            return message.reply("I couldn't play that YouTube track. <:smirk2:1498272372539785286> #- Check console logs.");
        }
    }
};