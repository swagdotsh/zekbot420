const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { readAdvisory, writeAdvisory } = require('./mp4Advisory');

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || (() => {
    try { return require('@ffprobe-installer/ffprobe').path; } catch { return 'ffprobe'; }
})();

const FORMATS = {
    mp3: { mux: 'mp3', cover: true },
    m4a: { mux: 'ipod', cover: true, mp4: true },
    mp4: { mux: 'mp4', cover: true, mp4: true },
    aac: { mux: 'ipod', cover: true, mp4: true, outExt: 'm4a' },
    flac: { mux: 'flac', cover: true },
    ogg: { mux: 'ogg', cover: false },
    opus: { mux: 'opus', cover: false },
    wav: { mux: 'wav', cover: false, noAdvisory: true },
};

const FIELDS = {
    title: 'title',
    artist: 'artist',
    album: 'album',
    albumartist: 'album_artist',
    genre: 'genre',
    year: 'date',
    track: 'track',
    disc: 'disc',
    composer: 'composer',
    comment: 'comment',
};

const ADVISORY = { 0: 'None', 1: 'Explicit', 2: 'Clean', 4: 'Explicit' };
const ADVISORY_VALUE = { explicit: 1, clean: 2, none: 0 };

function formatFor(fileName) {
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const format = FORMATS[ext];
    return format ? { ext, ...format } : null;
}

async function withTempDir(fn) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zekbot-meta-'));
    try {
        return await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

async function probe(file) {
    const { stdout } = await execFileAsync(FFPROBE, [
        '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
    return JSON.parse(stdout);
}

function lowerKeys(tags = {}) {
    return Object.fromEntries(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
}

async function readMetadata(buffer, fileName) {
    const format = formatFor(fileName);
    if (!format) throw new Error('Unsupported file type.');

    return withTempDir(async (dir) => {
        const input = path.join(dir, `in.${format.ext}`);
        await fs.writeFile(input, buffer);
        const info = await probe(input);

        const audioStream = info.streams?.find((s) => s.codec_type === 'audio');
        if (!audioStream) throw new Error('That file has no audio.');
        const coverStream = info.streams?.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic);

        const tags = { ...lowerKeys(audioStream.tags), ...lowerKeys(info.format?.tags) };
        let advisoryValue = format.mp4 ? readAdvisory(buffer) : null;
        if (advisoryValue == null && tags.itunesadvisory != null) advisoryValue = Number(tags.itunesadvisory);
        if (advisoryValue == null && tags.rating != null && format.mp4) advisoryValue = Number(tags.rating);

        let cover = null;
        if (coverStream) {
            const coverFile = path.join(dir, 'cover.jpg');
            await execFileAsync(FFMPEG, ['-v', 'error', '-y', '-i', input, '-map', `0:${coverStream.index}`, '-frames:v', '1', coverFile], { timeout: 30000 })
                .then(async () => { cover = await fs.readFile(coverFile); })
                .catch(() => {});
        }

        return {
            tags,
            advisory: advisoryValue == null || Number.isNaN(advisoryValue) ? null : advisoryValue,
            advisoryLabel: ADVISORY[advisoryValue] ?? (advisoryValue == null ? 'Not set' : `Unknown (${advisoryValue})`),
            audio: {
                codec: audioStream.codec_long_name || audioStream.codec_name,
                sampleRate: Number(audioStream.sample_rate) || null,
                channels: audioStream.channels ?? null,
                bitsPerSample: Number(audioStream.bits_per_raw_sample || audioStream.bits_per_sample) || null,
            },
            duration: Number(info.format?.duration) || null,
            bitrate: Number(info.format?.bit_rate) || null,
            cover,
        };
    });
}

async function writeMetadata(buffer, fileName, changes) {
    const format = formatFor(fileName);
    if (!format) throw new Error('Unsupported file type.');
    if (changes.advisory !== undefined && format.noAdvisory) {
        throw new Error(`.${format.ext} files can't store an explicit/clean advisory.`);
    }
    if ((changes.cover || changes.removeCover) && !format.cover) {
        throw new Error(`Cover art can't be changed on .${format.ext} files.`);
    }

    const outExt = format.outExt ?? format.ext;
    return withTempDir(async (dir) => {
        const input = path.join(dir, `in.${format.ext}`);
        const output = path.join(dir, `out.${outExt}`);
        await fs.writeFile(input, buffer);

        const replaceCover = Boolean(changes.cover) || Boolean(changes.removeCover);
        const args = ['-v', 'error', '-y', '-i', input];
        if (changes.cover) {
            const coverFile = path.join(dir, 'cover');
            await fs.writeFile(coverFile, changes.cover);
            args.push('-i', coverFile);
        }

        args.push('-map', replaceCover ? '0:a' : '0', '-map_metadata', '0', '-c', 'copy');
        if (changes.cover) {
            args.push('-map', '1:0', '-disposition:v:0', 'attached_pic');
        }
        if (format.ext === 'mp3') args.push('-id3v2_version', '3', '-write_id3v1', '1');

        for (const [field, tag] of Object.entries(FIELDS)) {
            if (changes[field] === undefined) continue;
            args.push('-metadata', `${tag}=${changes[field]}`);
        }

        const originalAdvisory = format.mp4 ? readAdvisory(buffer) : null;
        if (!format.mp4 && changes.advisory !== undefined) {
            const value = ADVISORY_VALUE[changes.advisory];
            args.push('-metadata', `ITUNESADVISORY=${value ? value : ''}`);
        }

        args.push('-f', format.mux, output);
        try {
            await execFileAsync(FFMPEG, args, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
        } catch (error) {
            const detail = String(error.stderr || error.message).split('\n').find(Boolean) ?? '';
            throw new Error(`ffmpeg couldn't rewrite that file. ${detail}`.trim());
        }

        let result = await fs.readFile(output);
        if (format.mp4) {
            const value = changes.advisory !== undefined ? ADVISORY_VALUE[changes.advisory] : originalAdvisory;
            result = writeAdvisory(result, value ? value : null);
        }

        const base = path.basename(fileName, path.extname(fileName));
        return { buffer: result, fileName: `${base}.${outExt}` };
    });
}

module.exports = { readMetadata, writeMetadata, formatFor, FORMATS, FIELDS, ADVISORY };
