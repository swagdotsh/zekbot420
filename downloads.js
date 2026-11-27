const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createGuildStore } = require('./guildDataStore');
const { assertPublicUrl } = require('./safeFetch');
const { uploadLimit } = require('./socialEmbeds');

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const MAX_DURATION = 240;
const MAX_RUNNING = 2;
const COMMAND_TIMEOUT_MS = 3 * 60 * 1000;

const store = createGuildStore('downloads.json', () => ({ enabled: false }));
let running = 0;

class DownloadError extends Error {}

async function isEnabled(guildId) {
    return Boolean(guildId) && (await store.get(guildId)).enabled;
}

function run(bin, args) {
    return execFileAsync(bin, args, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
}

async function getDuration(url) {
    const { stdout } = await run(YTDLP_BIN, ['--no-playlist', '--no-warnings', '--print', '%(duration)s', '--', url]);
    return parseFloat(stdout.trim().split('\n')[0]);
}

async function compress(inputPath, outputPath, durationSec, maxBytes) {
    const audioKbps = 96;
    const videoKbps = Math.max(100, Math.floor((maxBytes * 8 * 0.92) / durationSec / 1000) - audioKbps);
    await run(FFMPEG_BIN, [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-i', inputPath,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
        '-c:a', 'aac', '-b:a', `${audioKbps}k`,
        '-movflags', '+faststart',
        outputPath,
    ]);
}

async function downloadVideo(rawUrl, guild, onStatus) {
    let url;
    try {
        url = (await assertPublicUrl(String(rawUrl ?? '').trim())).href;
    } catch {
        throw new DownloadError('Provide a valid public http(s) link.');
    }
    if (running >= MAX_RUNNING) throw new DownloadError('I\'m already downloading a couple of videos, try again in a minute.');

    running++;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zekbot-dl-'));
    try {
        const duration = await getDuration(url).catch(() => NaN);
        if (!Number.isFinite(duration) || duration <= 0) throw new DownloadError('Couldn\'t find a video at that link.');
        if (duration > MAX_DURATION) throw new DownloadError(`That video is too long (${Math.round(duration)}s). The most is ${MAX_DURATION}s.`);

        const rawPath = path.join(dir, 'video.mp4');
        await run(YTDLP_BIN, [
            '--no-playlist', '--no-warnings',
            '--max-filesize', '300M',
            '--format', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b',
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', FFMPEG_BIN,
            '--output', rawPath,
            '--', url,
        ]);

        const maxBytes = uploadLimit(guild);
        const rawSize = (await fs.stat(rawPath)).size;
        if (rawSize <= maxBytes) return { buffer: await fs.readFile(rawPath), compressed: false };

        await onStatus?.('Compressing...');
        const compressedPath = path.join(dir, 'compressed.mp4');
        await compress(rawPath, compressedPath, duration, maxBytes);
        const output = await fs.readFile(compressedPath);
        if (output.length > maxBytes) throw new DownloadError('That video is too big to upload here, even after compressing it.');
        return { buffer: output, compressed: true };
    } finally {
        running--;
        fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = { store, isEnabled, downloadVideo, DownloadError, MAX_DURATION };
