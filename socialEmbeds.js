const path = require('path');
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { readJson, updateJson } = require('./jsonStore');
const { DATA_DIR } = require('./paths');
const { fetchLimited } = require('./safeFetch');
const { EMOJI, loading, fail } = require('./ui');

const DEFAULTS = { enabled: false, x: true, instagram: true, hideOriginalEmbed: false };
const MAX_LINKS_PER_MESSAGE = 3;
const MAX_ATTACHMENTS = 10;
const MAX_CONTENT = 2000;
const USER_COOLDOWN_MS = 5000;
const USER_AGENT = 'zekbot420 (Discord bot; +https://github.com/swagdotsh/zekbot420)';

const X_LINK = /(?<!<)https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status(?:es)?\/(\d{5,25})/gi;
const IG_LINK = /(?<!<)https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]{5,40})/gi;

const configCache = new Map();
const configPath = (guildId) => path.join(DATA_DIR, String(guildId), 'socialEmbeds.json');

async function getConfig(guildId) {
    if (!configCache.has(guildId)) {
        const stored = await readJson(configPath(guildId), {}).catch((error) => {
            console.error('[socialEmbeds] failed to read config:', error);
            return {};
        });
        configCache.set(guildId, { ...DEFAULTS, ...stored });
    }
    return configCache.get(guildId);
}

async function setConfig(guildId, changes) {
    const next = await updateJson(configPath(guildId), {}, (current) => ({ ...DEFAULTS, ...current, ...changes }));
    configCache.set(guildId, { ...DEFAULTS, ...next });
    return configCache.get(guildId);
}

function uploadLimit(guild) {
    const mib = 1024 * 1024;
    const tier = guild?.premiumTier ?? 0;
    const limit = tier >= 3 ? 100 * mib : tier === 2 ? 50 * mib : 10 * mib;
    return limit - 256 * 1024;
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const compact = (n) => (Number.isFinite(n) ? COMPACT.format(n) : null);

function decodeEntities(text) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code) => {
        if (code[0] === '#') {
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) ? String.fromCodePoint(n) : match;
        }
        return named[code.toLowerCase()] ?? match;
    });
}

function htmlToText(html) {
    return decodeEntities(
        html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    ).replace(/\n{3,}/g, '\n\n').trim();
}

function truncate(text, max) {
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function extensionFor(url, fallback) {
    const ext = path.extname(new URL(url).pathname).toLowerCase().replace('.', '');
    return /^(jpe?g|png|gif|webp|mp4|mov)$/.test(ext) ? ext : fallback;
}

async function fetchXPost(handle, id) {
    const body = await fetchLimited(`https://api.fxtwitter.com/${handle}/status/${id}`, {
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 10000,
        headers: { 'User-Agent': USER_AGENT },
    });
    const data = JSON.parse(body.toString('utf8'));
    const tweet = data?.tweet;
    if (data?.code !== 200 || !tweet) throw new Error(data?.message || 'Post not found.');

    const media = (tweet.media?.all ?? []).map((item) => {
        if (item.type === 'photo') return { kind: 'photo', candidates: [item.url] };

        const mp4s = (item.formats ?? [])
            .filter((format) => format.container === 'mp4' && format.url)
            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
        const candidates = mp4s.length ? mp4s.map((format) => ({ url: format.url, bitrate: format.bitrate })) : [item.url];
        return { kind: 'video', candidates, duration: item.duration, link: item.url, thumbnail: item.thumbnail_url };
    });

    const stats = [
        tweet.likes != null && `❤️ ${compact(tweet.likes)}`,
        tweet.retweets != null && `🔁 ${compact(tweet.retweets)}`,
        tweet.replies != null && `💬 ${compact(tweet.replies)}`,
    ].filter(Boolean);

    return {
        platform: 'X',
        url: tweet.url || `https://x.com/${handle}/status/${id}`,
        author: tweet.author?.name || handle,
        handle: tweet.author?.screen_name || handle,
        text: tweet.text ?? '',
        quote: tweet.quote ? `${tweet.quote.author?.name ?? ''} (@${tweet.quote.author?.screen_name ?? '?'}): ${tweet.quote.text ?? ''}` : null,
        timestamp: tweet.created_timestamp ?? null,
        stats,
        sensitive: Boolean(tweet.possibly_sensitive),
        media,
    };
}

function parseInstagramEmbed(html, kind) {
    const username = html.match(/class="UsernameText">([^<]+)</)?.[1]
        ?? html.match(/class="CaptionUsername"[^>]*>([^<]+)</)?.[1]
        ?? null;

    let caption = '';
    const captionStart = html.indexOf('<div class="Caption">');
    if (captionStart !== -1) {
        const end = html.indexOf('<div class="CaptionComments">', captionStart);
        let chunk = html.slice(captionStart, end === -1 ? captionStart + 20000 : end);
        chunk = chunk.replace(/^<div class="Caption">\s*<a class="CaptionUsername"[^>]*>[^<]*<\/a>/, '');
        caption = htmlToText(chunk);
    }

    const images = [];
    const imageTag = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/)?.[0];
    if (imageTag) {
        const srcset = imageTag.match(/srcset="([^"]+)"/)?.[1];
        const best = srcset
            ? decodeEntities(srcset).split(',').map((part) => part.trim().split(/\s+/))
                .map(([url, width]) => ({ url, width: parseInt(width, 10) || 0 }))
                .sort((a, b) => b.width - a.width)[0]?.url
            : null;
        const src = imageTag.match(/src="([^"]+)"/)?.[1];
        const url = best || (src && decodeEntities(src));
        if (url) images.push(url);
    }

    const isVideo = kind.startsWith('reel') || kind === 'tv' || /class="[^"]*(?:VideoSprite|Video)[^"]*"/.test(html);
    return { username, caption, images, isVideo };
}

async function fetchInstagramPost(kind, shortcode) {
    const html = (await fetchLimited(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
        maxBytes: 3 * 1024 * 1024,
        timeoutMs: 10000,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.8' },
    })).toString('utf8');

    const post = parseInstagramEmbed(html, kind);
    if (!post.username && !post.caption && !post.images.length) {
        throw new Error('That post is private, deleted, or not embeddable.');
    }

    return {
        platform: 'Instagram',
        url: `https://www.instagram.com/${kind.startsWith('reel') ? 'reel' : 'p'}/${shortcode}/`,
        author: post.username,
        handle: post.username,
        text: post.caption,
        quote: null,
        timestamp: null,
        stats: [],
        sensitive: false,
        note: post.isVideo ? '🎬 This is a video. Instagram only shares the thumbnail, so watch it at the link.' : null,
        media: post.images.map((url) => ({ kind: 'photo', candidates: [url] })),
    };
}

async function downloadMedia(post, guild) {
    const limit = uploadLimit(guild);
    let remaining = limit;
    const files = [];
    const skipped = [];

    for (const [index, item] of post.media.slice(0, MAX_ATTACHMENTS).entries()) {
        let downloaded = null;
        for (const candidate of item.candidates) {
            const url = typeof candidate === 'string' ? candidate : candidate.url;
            const estimate = candidate.bitrate && item.duration ? (candidate.bitrate * item.duration) / 8 : 0;
            if (estimate > remaining * 1.1) continue;

            try {
                const buffer = await fetchLimited(url, { maxBytes: remaining, timeoutMs: 30000, headers: { 'User-Agent': USER_AGENT } });
                const ext = extensionFor(url, item.kind === 'video' ? 'mp4' : 'jpg');
                downloaded = { buffer, name: `${post.sensitive ? 'SPOILER_' : ''}${post.platform.toLowerCase()}_${index + 1}.${ext}` };
                break;
            } catch (error) {
                if (!/too large/i.test(error.message)) {
                    console.warn(`[socialEmbeds] media download failed (${url}):`, error.message);
                    break;
                }
            }
        }

        if (downloaded) {
            remaining -= downloaded.buffer.length;
            files.push(new AttachmentBuilder(downloaded.buffer, { name: downloaded.name }));
        } else {
            skipped.push(item.link ?? (typeof item.candidates[0] === 'string' ? item.candidates[0] : item.candidates[0]?.url));
        }
    }

    if (post.media.length > MAX_ATTACHMENTS) skipped.push(...post.media.slice(MAX_ATTACHMENTS).map((m) => m.link ?? m.candidates[0]?.url ?? m.candidates[0]));
    return { files, skipped: skipped.filter(Boolean) };
}

function buildContent(post, skipped) {
    const icon = post.platform === 'X' ? EMOJI.x : EMOJI.instagram;
    const who = post.handle && post.author !== post.handle ? `**${post.author}** (@${post.handle})` : `**@${post.handle ?? 'unknown'}**`;
    const header = `${icon} ${who} - [${post.platform}](<${post.url}>)`;

    const footerParts = [...post.stats];
    if (post.timestamp) footerParts.push(`<t:${post.timestamp}:R>`);
    const lines = [];
    if (footerParts.length) lines.push(`-# ${footerParts.join(' - ')}`);
    if (post.note) lines.push(`-# ${post.note}`);
    if (skipped.length) {
        lines.push(`-# Too big to upload here: ${skipped.map((url, i) => `[media ${i + 1}](<${url}>)`).join(', ')}`);
    }
    const footer = lines.join('\n');

    let body = post.text ? post.text.trim() : '';
    if (post.quote) body += `${body ? '\n\n' : ''}> ↪ ${post.quote.replace(/\n/g, '\n> ')}`;

    const room = MAX_CONTENT - header.length - footer.length - 4;
    body = truncate(body, Math.max(0, room));

    return [header, body, footer].filter(Boolean).join('\n');
}

const userCooldowns = new Map();

function findLinks(content, config) {
    const links = [];
    if (config.x) {
        for (const match of content.matchAll(X_LINK)) links.push({ type: 'x', handle: match[1], id: match[2], at: match.index });
    }
    if (config.instagram) {
        for (const match of content.matchAll(IG_LINK)) links.push({ type: 'instagram', kind: match[1].toLowerCase(), id: match[2], at: match.index });
    }

    const seen = new Set();
    return links
        .sort((a, b) => a.at - b.at)
        .filter((link) => {
            const key = `${link.type}:${link.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, MAX_LINKS_PER_MESSAGE);
}

async function handleSocialEmbed(message) {
    if (!message.guild || message.author.bot || !message.content) return;
    if (!/(?:x|twitter|instagram)\.com\//i.test(message.content)) return;

    const config = await getConfig(message.guild.id);
    if (!config.enabled) return;

    const links = findLinks(message.content, config);
    if (!links.length) return;

    const me = message.guild.members.me;
    const perms = message.channel.permissionsFor(me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory])) return;
    const canAttach = perms.has(PermissionFlagsBits.AttachFiles);

    const now = Date.now();
    if ((userCooldowns.get(message.author.id) ?? 0) > now) return;
    userCooldowns.set(message.author.id, now + USER_COOLDOWN_MS);

    if (config.hideOriginalEmbed && perms.has(PermissionFlagsBits.ManageMessages)) {
        message.suppressEmbeds(true).catch(() => {});
        setTimeout(() => message.suppressEmbeds(true).catch(() => {}), 3000).unref?.();
    }

    for (const link of links) {
        const status = await message.reply({
            content: loading(`Fetching ${link.type === 'x' ? 'X' : 'Instagram'} post...`),
            allowedMentions: { repliedUser: false },
        }).catch(() => null);
        if (!status) return;

        try {
            const post = link.type === 'x'
                ? await fetchXPost(link.handle, link.id)
                : await fetchInstagramPost(link.kind, link.id);

            const { files, skipped } = canAttach ? await downloadMedia(post, message.guild) : { files: [], skipped: post.media.map((m) => m.link ?? m.candidates[0]?.url ?? m.candidates[0]) };

            await status.edit({
                content: buildContent(post, skipped),
                files,
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            console.warn(`[socialEmbeds] ${link.type} ${link.id}:`, error.message);
            await status.edit({ content: fail("Couldn't load that post. It may be private, deleted, or age-restricted.") }).catch(() => {});
            setTimeout(() => status.delete().catch(() => {}), 10000).unref?.();
        }
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, until] of userCooldowns) if (until < now) userCooldowns.delete(userId);
}, 60 * 1000).unref();

module.exports = {
    handleSocialEmbed,
    getConfig,
    setConfig,
    findLinks,
    parseInstagramEmbed,
    fetchXPost,
    fetchInstagramPost,
    buildContent,
    downloadMedia,
    uploadLimit,
};
