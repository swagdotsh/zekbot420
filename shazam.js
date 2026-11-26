const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Shazam } = require('node-shazam');
const { fetchLimited } = require('./safeFetch');

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || (() => {
    try { return require('@ffprobe-installer/ffprobe').path; } catch { return 'ffprobe'; }
})();

const MAX_BYTES = 100 * 1024 * 1024;
const CLIP_SECONDS = 20;
const MAX_CONCURRENT = 2;

const shazam = new Shazam();

const MEDIA_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|gif|mp3|m4a|aac|wav|flac|ogg|oga|opus|wma|3gp)$/i;

let running = 0;
const waiting = [];
async function withSlot(fn) {
    if (running >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
    running++;
    try {
        return await fn();
    } finally {
        running--;
        waiting.shift()?.();
    }
}

function isMediaAttachment(attachment) {
    const type = attachment.contentType ?? '';
    return type.startsWith('video/') || type.startsWith('audio/') || MEDIA_EXT.test(attachment.name ?? '');
}

function findMedia(message) {
    if (!message) return null;
    const attachment = message.attachments?.find(isMediaAttachment);
    if (attachment) return { url: attachment.url, name: attachment.name, size: attachment.size };

    for (const embed of message.embeds ?? []) {
        const url = embed.video?.proxyURL ?? embed.video?.url;
        if (url && (MEDIA_EXT.test(new URL(url).pathname) || /discordapp\.(com|net)/.test(new URL(url).hostname))) {
            return { url, name: path.basename(new URL(url).pathname) || 'video.mp4', size: null };
        }
    }
    return null;
}

async function durationOf(file) {
    const { stdout } = await execFileAsync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 30000 });
    return Number(stdout.trim()) || 0;
}

function clipOffsets(duration) {
    if (!duration || duration <= CLIP_SECONDS + 2) return [0];
    const offsets = [0, duration / 3, duration / 2, duration * 0.7].map((t) => Math.min(Math.floor(t), Math.floor(duration - CLIP_SECONDS)));
    return [...new Set(offsets)];
}

function formatTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function cleanAppleMusicUrl(uri) {
    try {
        const url = new URL(uri);
        if (!/music\.apple\.com$/.test(url.hostname)) return null;
        const trackId = url.searchParams.get('i');
        url.search = trackId ? `?i=${trackId}` : '';
        return url.href;
    } catch {
        return null;
    }
}

function toResult(response, clipOffset) {
    const track = response?.track;
    if (!track) return null;

    const meta = Object.fromEntries((track.sections?.find((s) => s.type === 'SONG' || s.metadata)?.metadata ?? []).map((m) => [m.title, m.text]));
    const appleUri = [...(track.hub?.options ?? []).flatMap((o) => o.actions ?? []), ...(track.hub?.actions ?? [])]
        .map((a) => a.uri).find((uri) => uri && /music\.apple\.com/.test(uri));

    const matchOffset = response.matches?.[0]?.offset;
    return {
        title: track.title,
        artist: track.subtitle,
        album: meta.Album ?? null,
        label: meta.Label ?? null,
        released: meta.Released ?? null,
        genre: track.genres?.primary ?? null,
        coverArt: track.images?.coverarthq ?? track.images?.coverart ?? null,
        shazamUrl: track.url ?? track.share?.href ?? null,
        appleMusicUrl: appleUri ? cleanAppleMusicUrl(appleUri) : null,
        explicit: track.hub?.explicit ?? null,
        heardAt: clipOffset,
        songOffset: Number.isFinite(matchOffset) ? matchOffset : null,
    };
}

async function recognizeUrl(url, { maxBytes = MAX_BYTES } = {}) {
    return withSlot(async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zekbot-shazam-'));
        try {
            const input = path.join(dir, 'input');
            await fs.writeFile(input, await fetchLimited(url, { maxBytes, timeoutMs: 60000 }));

            const duration = await durationOf(input).catch(() => 0);
            for (const offset of clipOffsets(duration)) {
                const clip = path.join(dir, `clip-${offset}.wav`);
                try {
                    await execFileAsync(FFMPEG, [
                        '-v', 'error', '-y', '-ss', String(offset), '-i', input, '-t', String(CLIP_SECONDS),
                        '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', clip,
                    ], { timeout: 60000 });
                } catch {
                    if (offset === 0) throw new Error('NO_AUDIO');
                    continue;
                }

                const response = await shazam.recognise(clip, 'en-US');
                const result = toResult(response, offset);
                if (result) return result;
            }
            return null;
        } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    });
}

const DEFAULT_COLOR = 0x0088ff;

async function coverColor(url) {
    if (!url) return DEFAULT_COLOR;
    try {
        const sharp = require('sharp');
        const { fetchLimited } = require('./safeFetch');
        const image = await fetchLimited(url, { maxBytes: 5 * 1024 * 1024, timeoutMs: 8000 });
        const { data } = await sharp(image).resize(1, 1, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        return (data[0] << 16) | (data[1] << 8) | data[2];
    } catch {
        return DEFAULT_COLOR;
    }
}

async function buildReply(result) {
    const { EmbedBuilder } = require('discord.js');
    const { findOnSpotify, findOnAppleMusic } = require('./musicLinks');
    const { EMOJI, emojiUrl } = require('./ui');

    const want = { track: result.title, artist: result.artist, album: result.album };
    const [spotify, apple, color] = await Promise.all([
        findOnSpotify(want).catch(() => null),
        result.appleMusicUrl ? { url: result.appleMusicUrl } : findOnAppleMusic(want).catch(() => null),
        coverColor(result.coverArt),
    ]);

    const escape = (text) => String(text).replace(/([\\*_`~|[\]])/g, '\\$1');

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: 'Song identified', iconURL: emojiUrl(EMOJI.shazam) })
        .setTitle(String(result.title).replace(/\s*[🅴🄴Ⓔ]\s*/gu, ' ').trim().slice(0, 256))
        .setDescription(`by **${escape(result.artist)}**${result.album ? ` on **${escape(result.album)}**` : ''}`);
    if (result.shazamUrl) embed.setURL(result.shazamUrl);
    if (result.coverArt) embed.setThumbnail(result.coverArt);
    if (result.label) embed.setFooter({ text: result.label });

    const links = [];
    links.push(apple?.url ? `${EMOJI.appleMusic} **Apple Music:** <${apple.url}>` : `${EMOJI.appleMusic} **Apple Music:** not found`);
    if (spotify?.url) {
        links.push(spotify.exact
            ? `${EMOJI.spotify} **Spotify:** <${spotify.url}>`
            : `${EMOJI.spotify} **Spotify:** <${spotify.url}>\n-# Exact Spotify links need Spotify API keys on the bot, so this one opens a Spotify search.`);
    }

    return { content: links.join('\n'), embeds: [embed], components: [] };
}

function errorMessage(error) {
    if (error.message === 'NO_AUDIO') return 'That file has no audio to listen to.';
    if (/too large/i.test(error.message)) return `That file is too big (max ${MAX_BYTES / 1024 / 1024} MB).`;
    return 'Something went wrong listening to that. Try again in a moment.';
}

module.exports = { recognizeUrl, findMedia, isMediaAttachment, formatTime, buildReply, errorMessage, MAX_BYTES };
