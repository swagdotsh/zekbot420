const fs = require('fs');
const { PermissionFlagsBits } = require('discord.js');
const { spawn } = require('child_process');
const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType
} = require('@discordjs/voice');
const { connectVoice, watchConnection, createSessionOnce, isConnectionAlive } = require('./voiceConnection');
const { resolveSpotifyMatch, resolveStream, findFallback, SOURCE_EMOJIS } = require('./musicSources');
const { buildControls } = require('./musicControls');

const FFMPEG_BIN = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const INACTIVITY_MS = 2 * 60 * 1000;
const MAX_HISTORY = 20;

const MUSIC_DEBUG = /^(1|true|yes)$/i.test(process.env.MUSIC_DEBUG ?? '');

function musicLog(event, details = {}) {
    if (!MUSIC_DEBUG) return;
    console.log(`[music] ${JSON.stringify({ time: new Date().toISOString(), event, ...details })}`);
}

function trackDetails(track) {
    return { source: track?.sourceType, title: track?.title, duration: track?.duration };
}

function isOnlineTrack(track) {
    return ['youtube', 'soundcloud', 'spotify'].includes(track?.sourceType);
}

const OPUS_OUTPUT_ARGS = ['-vn', '-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-f', 'ogg', 'pipe:1'];

const RECONNECTED_NOISE = /Error in the pull function|IO error: Error number -10054|Connection reset by peer|Will reconnect at/i;

function spawnFfmpegOpus(input, headers = null) {
    const startedAt = Date.now();
    const inputArgs = headers
        ? [
            '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '5',
            '-headers', Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n',
            '-i', input
        ]
        : ['-i', input];

    const ffmpeg = spawn(FFMPEG_BIN, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputArgs, ...OPUS_OUTPUT_ARGS], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    ffmpeg.on('spawn', () => musicLog('ffmpeg-start', { pid: ffmpeg.pid }));
    ffmpeg.stdout.once('end', () => musicLog('ffmpeg-output-end', {
        pid: ffmpeg.pid, elapsedMs: Date.now() - startedAt
    }));
    ffmpeg.on('close', (code, signal) => musicLog('ffmpeg-exit', {
        pid: ffmpeg.pid, code, signal, elapsedMs: Date.now() - startedAt
    }));

    ffmpeg.stderr.on('data', (chunk) => {
        const text = chunk.toString()
            .split('\n')
            .filter(line => line.trim() && !RECONNECTED_NOISE.test(line))
            .join('\n')
            .trim();
        if (text) console.error(`ffmpeg stderr: ${text}`);
    });

    ffmpeg.on('error', (err) => {
        console.error('Failed to start ffmpeg:', err);
    });

    ffmpeg.stdout.on('close', () => {
        ffmpeg.kill('SIGKILL');
    });

    return ffmpeg;
}

function buildResource(track) {
    musicLog('resource-create', trackDetails(track));
    if (isOnlineTrack(track) && !track.stream) throw new Error(`No stream resolved for ${track.url}`);

    const ffmpeg = isOnlineTrack(track)
        ? spawnFfmpegOpus(track.stream.url, track.stream.headers)
        : spawnFfmpegOpus(track.filePath);

    return createAudioResource(ffmpeg.stdout, { inputType: StreamType.OggOpus });
}

const STREAM_MAX_AGE_MS = 30 * 60 * 1000;

async function prepareTrack(track, onFallback) {
    musicLog('track-prepare', trackDetails(track));
    if (!isOnlineTrack(track)) return true;
    if (track.stream && Date.now() - track.stream.resolvedAt < STREAM_MAX_AGE_MS) return true;

    const playUrl = track.fallbackUrl
        || (track.sourceType === 'spotify' ? ((await resolveSpotifyMatch(track)) ? track.playUrl : null) : track.url);

    if (playUrl) {
        try {
            track.stream = await resolveStream(playUrl);
            musicLog('stream-resolved', { ...trackDetails(track), format: track.stream.formatId });
            return true;
        } catch (err) {
            if (!err.blocked) throw err;
            console.warn(`Blocked, looking for another upload: ${playUrl}`);
        }
    }

    if (track.sourceType === 'soundcloud' || track.fallbackUrl) return false;

    await onFallback?.();
    const fallback = await findFallback(track, playUrl);
    if (!fallback) return false;

    track.fallbackUrl = fallback.url;
    track.playSource = fallback.source;
    track.stream = fallback.stream;
    musicLog('fallback-resolved', { ...trackDetails(track), playSource: track.playSource });
    return true;
}

function cleanupTrack(track) {
    if (track?.sourceType === 'local' && track.filePath && fs.existsSync(track.filePath)) {
        fs.unlinkSync(track.filePath);
    }
}

function releaseTrack(session, track) {
    if (!track || track === session.current || session.queue.includes(track) || session.history.includes(track)) return;
    cleanupTrack(track);
}

function rememberTrack(session, track) {
    session.history.push(track);
    if (session.history.length > MAX_HISTORY) releaseTrack(session, session.history.shift());
}

function cleanupSessionFiles(session) {
    const tracks = new Set([session.current, ...session.queue, ...(session.history ?? [])]);
    for (const track of tracks) cleanupTrack(track);
}

function trackLabel(track) {
    if (!track) return 'Unknown track';
    if (track.sourceType === 'local') return track.attachment?.name || track.title || 'Unknown file';
    return track.uploader ? `${track.title} - ${track.uploader}` : track.title;
}

function displaySource(track) {
    return track.sourceType === 'spotify' ? 'spotify' : (track.playSource ?? track.sourceType);
}

function nowPlayingText(track) {
    const duration = track.durationRaw && track.durationRaw !== 'Unknown' ? ` \`${track.durationRaw}\`` : '';
    let note = '';
    if (track.playSource === 'soundcloud') note = "\n-# YouTube wouldn't play this one, so it's coming from SoundCloud.";
    else if (track.playSource === 'youtube' && track.sourceType === 'youtube') note = "\n-# That video is age-restricted or blocked, so this is another upload of it.";
    return `${SOURCE_EMOJIS[displaySource(track)] ?? '🎵'} Playing now: **${trackLabel(track)}**${duration}${note}`;
}

const SLOW_NOTICE_MS = 5000;

async function showSlowNotice(client, session, track) {
    if (track.slowNoticeShown) return;
    track.slowNoticeShown = true;

    const payload = {
        content: `${SOURCE_EMOJIS[track.sourceType] ?? '🎵'} Loading **${trackLabel(track)}**...\n-# This is taking longer than expected... please wait!`,
        components: [],
    };

    if (session.pendingStatusMessage) {
        await session.pendingStatusMessage.edit(payload).catch(() => {});
        return;
    }

    const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
    const message = channel?.isTextBased() ? await channel.send(payload).catch(() => null) : null;
    if (message) session.pendingStatusMessage = message;
}

async function sendStatus(client, session, payload) {
    if (session.pendingStatusMessage) {
        const message = session.pendingStatusMessage;
        session.pendingStatusMessage = null;
        const edited = await message.edit(payload).catch(() => null);
        if (edited) return edited;
    }

    const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
    return channel?.isTextBased() ? channel.send(payload).catch(() => null) : null;
}

async function retireNowPlaying(session) {
    const previous = session.nowPlayingMessage;
    session.nowPlayingMessage = null;
    if (previous) await previous.edit({ components: [] }).catch(() => {});
}

async function announceNowPlaying(client, session, track) {
    await retireNowPlaying(session);
    session.nowPlayingMessage = await sendStatus(client, session, {
        content: nowPlayingText(track),
        components: buildControls(session.connection.joinConfig.guildId),
    });
}

async function playNext(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session) return;

    const nextTrack = session.queue.shift();

    if (!nextTrack) {
        await retireNowPlaying(session);
        if (session.inactivityTimeout) clearTimeout(session.inactivityTimeout);

        session.inactivityTimeout = setTimeout(async () => {
            const latest = client.voiceSessions?.get(guildId);
            if (!latest) return;
            if (latest.current || latest.queue.length > 0) return;

            const channel = latest.textChannelId
                ? await client.channels.fetch(latest.textChannelId).catch(() => null)
                : null;

            teardownSession(client, guildId, latest);

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

    session.current = nextTrack;

    try {
        let notice = null;
        const showNotice = () => (notice ??= showSlowNotice(client, session, nextTrack));
        const slowTimer = setTimeout(showNotice, SLOW_NOTICE_MS);

        let playable;
        try {
            playable = await prepareTrack(nextTrack, showNotice);
        } finally {
            clearTimeout(slowTimer);
            await notice;
            nextTrack.slowNoticeShown = false;
        }

        if (!playable) {
            await sendStatus(client, session, `Couldn't play **${trackLabel(nextTrack)}** from YouTube or SoundCloud, skipping it.`);
            session.current = null;
            await playNext(client, guildId);
            return;
        }

        if (client.voiceSessions?.get(guildId) !== session) return;

        nextTrack.startedAt = Date.now();
        musicLog('play-request', { guildId, connection: session.connection.state.status, ...trackDetails(nextTrack) });
        session.player.play(buildResource(nextTrack));
        await announceNowPlaying(client, session, nextTrack);
    } catch (err) {
        console.error('Failed to build/play track resource:', err);
        session.current = null;
        releaseTrack(session, nextTrack);
        await playNext(client, guildId);
    }
}

async function onTrackEnd(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session || session.mode === 'tts') return;

    const skipped = session.skipRequested;
    const wentBack = session.goingBack;
    session.skipRequested = false;
    session.goingBack = false;

    if (session.loopMode === 'track' && session.current && !skipped) {
        try {
            if (await prepareTrack(session.current)) {
                session.current.startedAt = Date.now();
                session.player.play(buildResource(session.current));
                return;
            }
        } catch (err) {
            console.error('Loop track replay failed:', err);
        }
    }

    const finished = session.current;
    session.current = null;

    if (finished && !wentBack) {
        if (session.loopMode === 'queue') session.queue.push(finished);
        rememberTrack(session, finished);
    }

    await playNext(client, guildId);
}

async function getOrCreateSession(message, voiceChannel) {
    const client = message.client;
    const guildId = message.guild.id;

    if (!client.voiceSessions) client.voiceSessions = new Map();

    const existing = client.voiceSessions.get(guildId);
    if (existing && isConnectionAlive(existing.connection)) {
        musicLog('session-reuse', { guildId, connection: existing.connection.state.status, player: existing.player.state.status });
        return existing;
    }
    if (existing) teardownSession(client, guildId, existing);

    return createSessionOnce(client, guildId, () => createSession(message, voiceChannel));
}

async function createSession(message, voiceChannel) {
    const client = message.client;
    const guildId = message.guild.id;

    musicLog('voice-join', { guildId, channelId: voiceChannel.id });

    const connection = await connectVoice(message.guild, voiceChannel.id);

    connection.on('stateChange', (oldState, newState) => musicLog('voice-state', {
        guildId, from: oldState.status, to: newState.status,
        reason: newState.reason, closeCode: newState.closeCode
    }));
    connection.on('error', (error) => console.error('[music] voice-error', { guildId, message: error.message, stack: error.stack }));

    const player = createAudioPlayer();
    const subscription = connection.subscribe(player);
    musicLog('player-subscribe', { guildId, subscribed: Boolean(subscription) });
    player.on('stateChange', (oldState, newState) => musicLog('player-state', {
        guildId, from: oldState.status, to: newState.status,
        playbackDuration: newState.resource?.playbackDuration ?? oldState.resource?.playbackDuration,
        missedFrames: newState.missedFrames
    }));

    const session = {
        connection,
        player,
        current: null,
        queue: [],
        history: [],
        textChannelId: message.channel.id,
        inactivityTimeout: null,
        loopMode: 'off',
        skipRequested: false,
        goingBack: false,
        nowPlayingMessage: null,
        pendingStatusMessage: null
    };

    client.voiceSessions.set(guildId, session);

    player.on(AudioPlayerStatus.Idle, () => {
        onTrackEnd(client, guildId).catch(console.error);
    });

    player.on('error', (err) => {
        console.error('Audio player error:', err);
        const active = client.voiceSessions?.get(guildId);
        if (active) active.skipRequested = true;
    });

    watchConnection(connection, async () => {
        if (client.voiceSessions?.get(guildId) !== session) return;
        teardownSession(client, guildId, session);

        const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
        if (channel?.isTextBased()) {
            await channel.send('Got disconnected from the voice channel, so I cleared the queue.').catch(() => {});
        }
    });

    return session;
}

function teardownSession(client, guildId, session) {
    if (client.voiceSessions?.get(guildId) === session) client.voiceSessions.delete(guildId);

    if (session.inactivityTimeout) clearTimeout(session.inactivityTimeout);
    if (session.emptyVoiceTimeout) clearTimeout(session.emptyVoiceTimeout);
    session.inactivityTimeout = null;
    session.emptyVoiceTimeout = null;

    retireNowPlaying(session).catch(() => {});
    cleanupSessionFiles(session);

    session.queue = [];
    session.history = [];
    session.current = null;

    session.player.removeAllListeners(AudioPlayerStatus.Idle);
    session.player.stop(true);
    if (isConnectionAlive(session.connection)) session.connection.destroy();
}

const SMIRK = '<:smirk2:1498272372539785286>';

function voiceChannelBlocker(member, session) {
    const channelId = session?.connection?.joinConfig?.channelId;
    if (!channelId || !member) return null;
    if (member.voice?.channelId === channelId) return null;
    if (member.permissions?.has(PermissionFlagsBits.MoveMembers)) return null;
    return `Join <#${channelId}> to control the music. ${SMIRK}`;
}

function skipCurrent(session) {
    session.skipRequested = true;
    session.player.stop(true);
}

function togglePause(session) {
    if (!session.current) return null;
    if (session.player.state.status === AudioPlayerStatus.Paused) {
        session.player.unpause();
        return false;
    }
    return session.player.pause() ? true : null;
}

async function goBack(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    const previous = session?.history.pop();
    if (!previous) return null;

    if (session.current) session.queue.unshift(session.current);
    session.queue.unshift(previous);

    if (session.current) {
        session.goingBack = true;
        session.skipRequested = true;
        session.player.stop(true);
    } else {
        await playNext(client, guildId);
    }

    return previous;
}

function stopSession(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session) return false;

    teardownSession(client, guildId, session);
    return true;
}

module.exports = {
    getOrCreateSession,
    playNext,
    buildResource,
    prepareTrack,
    cleanupTrack,
    releaseTrack,
    cleanupSessionFiles,
    skipCurrent,
    togglePause,
    goBack,
    stopSession,
    teardownSession,
    voiceChannelBlocker,
    trackLabel,
    nowPlayingText
};
