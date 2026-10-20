const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const spotify = require('./spotify');

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';
const MAX_TRACK_DURATION_SEC = 7 * 60;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const SOURCE_NAMES = {
    yt: 'youtube', youtube: 'youtube',
    sc: 'soundcloud', soundcloud: 'soundcloud',
    sp: 'spotify', spotify: 'spotify',
    file: 'local', upload: 'local', local: 'local',
};

const SOURCE_LABELS = { youtube: 'YouTube', soundcloud: 'SoundCloud', spotify: 'Spotify', local: 'File' };
const SOURCE_EMOJIS = {
    youtube: '<:youtube:1561888041352691773>',
    soundcloud: '<:soundcloud:1561887969957117992>',
    spotify: '<:spotify:1561887506117689394>',
    local: '📂',
};

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'Unknown';

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function isUrl(input) {
    return /^https?:\/\//i.test(input) || /^spotify:/i.test(input);
}

function detectSource(query) {
    if (!isUrl(query)) return null;
    if (/^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(query)) return 'youtube';
    if (/^https?:\/\/((www|m|on)\.)?soundcloud\.com\//i.test(query)) return 'soundcloud';
    if (spotify.isSpotifyUrl(query)) return 'spotify';
    return 'unsupported';
}

async function ytDlpJsonLines(args) {
    const { stdout } = await execFileAsync(YTDLP_BIN, ['--no-warnings', ...args], { maxBuffer: 1024 * 1024 * 10 });
    return stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
}

const BLOCKED_PATTERN = /sign in to confirm|age-restricted|inappropriate for some users|private video|video unavailable|not available in your country|blocked|copyright|members-only|drm protected/i;

function isBlockedError(err) {
    return BLOCKED_PATTERN.test(`${err?.stderr ?? ''} ${err?.message ?? ''}`);
}

function fromYtDlpInfo(info, source, fallbackUrl) {
    return {
        sourceType: source,
        title: info.title || 'Unknown title',
        uploader: info.uploader || info.channel || 'Unknown artist',
        url: info.webpage_url || info.original_url || info.url || fallbackUrl,
        duration: Number.isFinite(info.duration) ? info.duration : null,
        durationRaw: formatDuration(info.duration),
        thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || null,
        requestedBy: null,
        startedAt: null,
    };
}

async function getYouTubeOembedTrack(url) {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`).catch(() => null);
    if (!res?.ok) return null;

    const data = await res.json();
    return {
        sourceType: 'youtube',
        title: data.title || 'Unknown title',
        uploader: data.author_name || 'Unknown artist',
        url,
        duration: null,
        durationRaw: 'Unknown',
        thumbnail: data.thumbnail_url || null,
        requestedBy: null,
        startedAt: null,
    };
}

async function getYtDlpTrack(query, source) {
    if (source === 'youtube' && !isUrl(query)) {
        const [entry] = await ytDlpJsonLines(['--flat-playlist', '--dump-json', `ytsearch1:${query}`]);
        return entry ? fromYtDlpInfo(entry, source) : null;
    }

    const target = isUrl(query) ? query : `scsearch1:${query}`;
    try {
        const [info] = await ytDlpJsonLines(['--dump-json', '--no-playlist', target]);
        return info ? fromYtDlpInfo(info, source, target) : null;
    } catch (err) {
        if (source === 'youtube' && isBlockedError(err)) return getYouTubeOembedTrack(query);
        throw err;
    }
}

async function resolveStream(url) {
    try {
        const [info] = await ytDlpJsonLines(['-f', 'bestaudio/best', '--no-playlist', '-j', url]);
        return { url: info.url, headers: info.http_headers ?? {}, formatId: info.format_id ?? '', resolvedAt: Date.now() };
    } catch (err) {
        err.blocked = isBlockedError(err);
        throw err;
    }
}

function cleanTitle(title) {
    return title.replace(/[([][^)\]]*[)\]]/g, ' ').replace(/\b(official|music|lyric|lyrics|video|audio|hd|4k)\b/gi, ' ').replace(/\s+/g, ' ').trim() || title;
}

function youtubeId(url) {
    return String(url ?? '').match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? null;
}

async function tryCandidates(searchPrefix, query, track, title, artists, skipUrl) {
    const entries = await ytDlpJsonLines(['--flat-playlist', '--dump-json', `${searchPrefix}:${query}`]).catch(() => []);
    const skipId = youtubeId(skipUrl);
    const knownLength = Number.isFinite(track.duration);

    const ranked = entries
        .filter(entry => !skipId || youtubeId(entry.url) !== skipId)
        .map(entry => ({ entry, score: scoreCandidate(entry, { ...track, title, artists }) }))
        .sort((a, b) => a.score - b.score);

    for (const { entry } of ranked.slice(0, 3)) {
        const length = entry.duration;
        if (Number.isFinite(length) && length <= 31 && !(knownLength && track.duration <= 31)) continue;
        if (knownLength && (!Number.isFinite(length) || Math.abs(length - track.duration) > 15)) continue;

        try {
            const stream = await resolveStream(entry.url);
            if (/preview/i.test(stream.formatId)) continue;
            return { url: entry.webpage_url || entry.url, stream };
        } catch {
        }
    }

    return null;
}

async function findFallback(track, blockedUrl) {
    const title = track.sourceType === 'spotify' ? track.title : cleanTitle(track.title);
    const artists = track.artists ?? (track.uploader ? [track.uploader] : []);
    const query = `${track.artists ? track.artists.join(' ') : track.uploader ?? ''} ${title}`.trim();

    const youtube = await tryCandidates('ytsearch5', query, track, title, artists, blockedUrl);
    if (youtube) return { ...youtube, source: 'youtube' };

    const soundcloud = await tryCandidates('scsearch5', query, track, title, artists, null);
    if (soundcloud) return { ...soundcloud, source: 'soundcloud' };

    return null;
}

async function probeAudio(filePath) {
    try {
        const { stdout } = await execFileAsync(FFPROBE_BIN, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath]);
        const parsed = JSON.parse(stdout || '{}');
        const audioStream = Array.isArray(parsed.streams) ? parsed.streams.find(s => s.codec_type === 'audio') : null;

        return {
            formatName: parsed?.format?.format_name || null,
            durationSec: parsed?.format?.duration ? Number(parsed.format.duration) : null,
            bitRate: parsed?.format?.bit_rate ? Number(parsed.format.bit_rate) : null,
            codec: audioStream?.codec_name || null,
            sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
            channels: audioStream?.channels ?? null,
        };
    } catch {
        return null;
    }
}

async function getUploadTrack(attachment, guildId) {
    if (attachment.size > MAX_UPLOAD_BYTES) return null;

    const ext = path.extname(attachment.name || '').toLowerCase() || '.mp3';
    const guildDataDir = path.join(__dirname, 'data', guildId);
    fs.mkdirSync(guildDataDir, { recursive: true });

    const filePath = path.join(guildDataDir, `temp_${Date.now()}${ext}`);
    const response = await axios.get(attachment.url, { responseType: 'arraybuffer', maxContentLength: MAX_UPLOAD_BYTES });
    fs.writeFileSync(filePath, Buffer.from(response.data));

    const probe = await probeAudio(filePath);

    return {
        sourceType: 'local',
        filePath,
        title: attachment.name || path.basename(filePath),
        duration: probe?.durationSec ?? null,
        durationRaw: formatDuration(probe?.durationSec),
        attachment: {
            name: attachment.name || path.basename(filePath),
            size: attachment.size ?? fs.statSync(filePath).size,
            contentType: attachment.contentType || null,
        },
        probe,
        requestedBy: null,
        startedAt: null,
    };
}

function fromSpotify(item) {
    return {
        sourceType: 'spotify',
        title: item.title,
        uploader: item.artists.join(', '),
        artists: item.artists,
        url: item.spotifyUrl,
        playUrl: null,
        duration: item.durationSec,
        durationRaw: formatDuration(item.durationSec),
        thumbnail: item.thumbnail,
        requestedBy: null,
        startedAt: null,
    };
}

async function getSpotifyTracks(query) {
    if (isUrl(query)) {
        const result = await spotify.getFromUrl(query);
        if (!result) return null;
        return { name: result.name, tracks: result.tracks.map(fromSpotify), total: result.total };
    }

    const item = await spotify.searchTrack(query);
    return item ? { name: null, tracks: [fromSpotify(item)], total: 1 } : null;
}

const UNWANTED_VERSIONS = ['cover', 'live', 'remix', 'sped up', 'slowed', 'nightcore', '8d', 'karaoke', 'instrumental', 'reverb', 'hour', 'reaction', 'tutorial', 'drum'];

function scoreCandidate(entry, track) {
    const title = String(entry.title ?? '').toLowerCase();
    const channel = String(entry.channel ?? entry.uploader ?? '').toLowerCase();
    const wanted = track.title.toLowerCase();

    let score = Number.isFinite(entry.duration) && Number.isFinite(track.duration)
        ? Math.abs(entry.duration - track.duration)
        : 30;
    if (score > 15) score += 60;

    if (channel.endsWith(' - topic')) score -= 8;
    if (track.artists.some(artist => channel.includes(artist.toLowerCase()))) score -= 5;
    if (title.includes('official audio')) score -= 3;
    if (!title.includes(wanted)) score += 10;

    for (const word of UNWANTED_VERSIONS) {
        const pattern = new RegExp(`\\b${word}s?\\b`);
        if (pattern.test(title) && !pattern.test(wanted)) score += 30;
    }

    return score;
}

async function resolveSpotifyMatch(track) {
    if (track.playUrl) return true;

    const query = `${track.artists.join(' ')} - ${track.title}`;
    const entries = await ytDlpJsonLines(['--flat-playlist', '--dump-json', `ytsearch5:${query}`]);
    if (!entries.length) return false;

    const best = entries
        .map(entry => ({ entry, score: scoreCandidate(entry, track) }))
        .sort((a, b) => a.score - b.score)[0].entry;

    track.playUrl = best.url || `https://www.youtube.com/watch?v=${best.id}`;
    return true;
}

module.exports = {
    SOURCE_NAMES,
    SOURCE_LABELS,
    SOURCE_EMOJIS,
    MAX_TRACK_DURATION_SEC,
    MAX_UPLOAD_BYTES,
    formatDuration,
    isUrl,
    detectSource,
    getYtDlpTrack,
    resolveStream,
    findFallback,
    getUploadTrack,
    getSpotifyTracks,
    resolveSpotifyMatch,
    scoreCandidate,
};
