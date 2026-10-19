// Shared playback for ,play ,sc ,yt and ,restart. Every session gets one set of player handlers,
// so a queue can mix uploaded files, YouTube and SoundCloud tracks.

const fs = require('fs');
const { spawn } = require('child_process');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const INACTIVITY_MS = 2 * 60 * 1000;

function isOnlineTrack(track) {
    return track?.sourceType === 'youtube' || track?.sourceType === 'soundcloud';
}

function createYtDlpFfmpegStream(url) {
    const ytDlp = spawn(YTDLP_BIN, [
        '-f', 'bestaudio/best',
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '-o', '-',
        url
    ], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const ffmpeg = spawn(FFMPEG_BIN, [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
    ], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    ytDlp.stdout.pipe(ffmpeg.stdin);

    ytDlp.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text) console.error(`yt-dlp stderr: ${text}`);
    });

    ffmpeg.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text) console.error(`ffmpeg stderr: ${text}`);
    });

    ytDlp.on('error', (err) => {
        console.error('Failed to start yt-dlp:', err);
        ffmpeg.stdin.destroy();
    });

    ffmpeg.on('error', (err) => {
        console.error('Failed to start ffmpeg:', err);
        ytDlp.kill('SIGKILL');
    });

    // skipping/stopping closes ffmpeg, don't leave yt-dlp downloading in the background
    ffmpeg.stdout.on('close', () => {
        ytDlp.kill('SIGKILL');
    });

    return ffmpeg.stdout;
}

function buildResource(track) {
    if (isOnlineTrack(track)) {
        return createAudioResource(createYtDlpFfmpegStream(track.url), { inputType: StreamType.Raw });
    }

    return createAudioResource(track.filePath);
}

function cleanupTrack(track) {
    if (track?.sourceType === 'local' && track.filePath && fs.existsSync(track.filePath)) {
        fs.unlinkSync(track.filePath);
    }
}

async function playNext(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session) return;

    const nextTrack = session.queue.shift();

    if (!nextTrack) {
        if (session.inactivityTimeout) clearTimeout(session.inactivityTimeout);

        session.inactivityTimeout = setTimeout(async () => {
            const latest = client.voiceSessions?.get(guildId);
            if (!latest) return;
            if (latest.current || latest.queue.length > 0) return;

            const channel = latest.textChannelId
                ? await client.channels.fetch(latest.textChannelId).catch(() => null)
                : null;

            if (latest.connection) latest.connection.destroy();
            client.voiceSessions.delete(guildId);

            if (channel?.isTextBased()) {
                await channel.send('Left voice channel after 2 minutes of inactivity.').catch(() => {});
            }
        }, INACTIVITY_MS);

        return;
    }

    if (session.inactivityTimeout) {
        clearTimeout(session.inactivityTimeout);
        session.inactivityTimeout = null;
    }

    try {
        nextTrack.startedAt = Date.now();
        session.current = nextTrack;
        session.player.play(buildResource(nextTrack));
    } catch (err) {
        console.error('Failed to build/play track resource:', err);
        cleanupTrack(nextTrack);
        session.current = null;
        await playNext(client, guildId);
    }
}

// Called when a track ends, gets skipped, or errors
async function onTrackEnd(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session || session.mode === 'tts') return;

    // a skip should move on even when looping the current track
    const skipped = session.skipRequested;
    session.skipRequested = false;

    if (session.loopMode === 'track' && session.current && !skipped) {
        try {
            session.current.startedAt = Date.now();
            session.player.play(buildResource(session.current));
            return;
        } catch (err) {
            console.error('Loop track replay failed:', err);
        }
    }

    if (session.loopMode === 'queue' && session.current) {
        session.queue.push(session.current);
    } else {
        cleanupTrack(session.current);
    }

    session.current = null;
    await playNext(client, guildId);
}

async function getOrCreateSession(message, voiceChannel) {
    const client = message.client;
    const guildId = message.guild.id;

    if (!client.voiceSessions) client.voiceSessions = new Map();

    const existing = client.voiceSessions.get(guildId);
    if (existing) return existing;

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    const session = {
        connection,
        player,
        current: null,
        queue: [],
        textChannelId: message.channel.id,
        inactivityTimeout: null,
        loopMode: 'off',
        skipRequested: false
    };

    client.voiceSessions.set(guildId, session);

    player.on(AudioPlayerStatus.Idle, () => {
        onTrackEnd(client, guildId).catch(console.error);
    });

    player.on('error', (err) => {
        console.error('Audio player error:', err);
        // the player goes idle after an error, which runs onTrackEnd. Skip the track loop so a broken track doesn't retry forever.
        const active = client.voiceSessions?.get(guildId);
        if (active) active.skipRequested = true;
    });

    return session;
}

function skipCurrent(session) {
    session.skipRequested = true;
    session.player.stop(true);
}

module.exports = {
    getOrCreateSession,
    playNext,
    buildResource,
    cleanupTrack,
    skipCurrent
};
