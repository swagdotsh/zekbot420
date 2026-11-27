const path = require('path');
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { readJson, updateJson } = require('./jsonStore');
const { DATA_DIR } = require('./paths');
const { fetchLimited, fetchWithInfo } = require('./safeFetch');
const { EMOJI, loading, fail } = require('./ui');

const DEFAULTS = { enabled: false, trigger: 'mention', x: true, instagram: true, tiktok: true, hideOriginalEmbed: false };
const TRIGGERS = ['mention', 'auto'];
const CALL_NAMES = ['zekbot420', 'zekbot', 'zkb', 'zk', '420'];
const MAX_LINKS_PER_MESSAGE = 3;
const MAX_ATTACHMENTS = 10;
const MAX_CONTENT = 2000;
const USER_COOLDOWN_MS = 5000;
const USER_AGENT = 'zekbot420 (Discord bot; +https://github.com/swagdotsh/zekbot420)';
const BROWSER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const PLATFORM_NAMES = { x: 'X', instagram: 'Instagram', tiktok: 'TikTok' };

const X_LINK = /(?<!<)https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status(?:es)?\/(\d{5,25})/gi;
const IG_LINK = /(?<!<)https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]{5,40})/gi;
const TT_LINK = /(?<!<)https?:\/\/(?:(?:www\.|m\.)?tiktok\.com\/(?:@([\w.-]{1,40})\/(video|photo)\/(\d{5,25})|t\/([\w-]{4,20}))|(?:vm|vt)\.tiktok\.com\/([\w-]{4,20}))/gi;

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

function tiktokItem(html) {
    const json = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (!json) throw new Error('TikTok returned an unexpected page.');
    const detail = JSON.parse(json)?.__DEFAULT_SCOPE__?.['webapp.video-detail'];
    const item = detail?.itemInfo?.itemStruct;
    if (detail?.statusCode !== 0 || !item?.id) throw new Error(detail?.statusMsg || 'Post not found.');
    return item;
}

async function fetchTikTokPost(link) {
    const pageUrl = link.id ? `https://www.tiktok.com/@${link.handle}/${link.kind}/${link.id}` : link.url;
    const page = await fetchWithInfo(pageUrl, {
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 10000,
        headers: { 'User-Agent': BROWSER_AGENT, 'Accept-Language': 'en-US,en;q=0.8' },
    });
    const item = tiktokItem(page.body.toString('utf8'));
    const headers = {
        'User-Agent': BROWSER_AGENT,
        Referer: 'https://www.tiktok.com/',
        Cookie: page.cookies.map((cookie) => cookie.split(';')[0]).join('; '),
    };

    const images = item.imagePost?.images ?? [];
    let media;
    if (images.length) {
        media = images.map((image) => ({ kind: 'photo', candidates: image.imageURL?.urlList ?? [], headers })).filter((m) => m.candidates.length);
    } else {
        const video = item.video ?? {};
        const variants = (video.bitrateInfo ?? [])
            .map((info) => ({
                url: info.PlayAddr?.UrlList?.[0],
                bitrate: info.Bitrate,
                size: Number(info.PlayAddr?.DataSize) || undefined,
                direct: /^h264$/i.test(info.CodecType ?? ''),
            }))
            .filter((variant) => variant.url)
            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
        if (!variants.length && video.playAddr) variants.push({ url: video.playAddr, bitrate: video.bitrate });
        media = variants.length ? [{ kind: 'video', candidates: variants, duration: video.duration, headers }] : [];
    }

    const handle = item.author?.uniqueId || link.handle || null;
    const stats = item.stats ?? {};
    return {
        platform: 'TikTok',
        url: `https://www.tiktok.com/@${handle ?? 'i'}/${images.length ? 'photo' : 'video'}/${item.id}`,
        author: item.author?.nickname || handle,
        handle,
        text: item.desc ?? '',
        quote: null,
        timestamp: Number(item.createTime) || null,
        stats: [
            stats.playCount != null && `▶️ ${compact(Number(stats.playCount))}`,
            stats.diggCount != null && `❤️ ${compact(Number(stats.diggCount))}`,
            stats.commentCount != null && `💬 ${compact(Number(stats.commentCount))}`,
        ].filter(Boolean),
        sensitive: false,
        media,
    };
}

const candidateUrl = (candidate) => (typeof candidate === 'string' ? candidate : candidate?.url);

async function fetchCandidate(item, candidate, maxBytes) {
    return fetchLimited(candidateUrl(candidate), {
        maxBytes,
        timeoutMs: 60000,
        headers: item.headers ?? { 'User-Agent': USER_AGENT },
    });
}

async function downloadVideo(item, budget) {
    const candidates = item.candidates.map((c) => (typeof c === 'string' ? { url: c } : c));
    const sizeOf = (c) => c.size ?? (c.bitrate && item.duration ? (c.bitrate * item.duration) / 8 : null);
    const fitting = candidates.filter((c) => c.direct !== false && (sizeOf(c) == null || sizeOf(c) <= budget * 1.1));

    for (const candidate of fitting) {
        try {
            const buffer = await fetchCandidate(item, candidate, budget);
            return { buffer, ext: extensionFor(candidate.url, 'mp4') };
        } catch (error) {
            if (!/too large/i.test(error.message)) console.warn(`[socialEmbeds] media download failed (${candidate.url}):`, error.message);
        }
    }
    return null;
}

async function downloadPhoto(item, budget) {
    for (const candidate of item.candidates) {
        try {
            const buffer = await fetchCandidate(item, candidate, budget);
            return { buffer, ext: extensionFor(candidateUrl(candidate), 'jpg') };
        } catch (error) {
            if (!/too large/i.test(error.message)) console.warn(`[socialEmbeds] media download failed (${candidateUrl(candidate)}):`, error.message);
        }
    }
    return null;
}

async function downloadMedia(post, guild) {
    let remaining = uploadLimit(guild);
    const files = [];
    const skipped = [];
    const items = post.media.slice(0, MAX_ATTACHMENTS);

    for (const [index, item] of items.entries()) {
        const downloaded = remaining > 0
            ? await (item.kind === 'video' ? downloadVideo(item, remaining) : downloadPhoto(item, remaining))
            : null;

        if (downloaded) {
            remaining -= downloaded.buffer.length;
            const name = `${post.sensitive ? 'SPOILER_' : ''}${post.platform.toLowerCase()}_${index + 1}.${downloaded.ext}`;
            files.push(new AttachmentBuilder(downloaded.buffer, { name }));
        } else {
            skipped.push(item.link ?? candidateUrl(item.candidates[0]));
        }
    }

    if (post.media.length > MAX_ATTACHMENTS) skipped.push(...post.media.slice(MAX_ATTACHMENTS).map((m) => m.link ?? candidateUrl(m.candidates[0])));
    return { files, skipped: skipped.filter(Boolean) };
}

function buildContent(post, skipped) {
    const icon = { X: EMOJI.x, Instagram: EMOJI.instagram, TikTok: EMOJI.tiktok }[post.platform] ?? '';
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
    if (config.tiktok) {
        for (const match of content.matchAll(TT_LINK)) {
            links.push(match[3]
                ? { type: 'tiktok', handle: match[1], kind: match[2].toLowerCase(), id: match[3], at: match.index }
                : { type: 'tiktok', url: match[0], id: `short:${(match[4] ?? match[5]).toLowerCase()}`, at: match.index });
        }
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

function calledContent(content, botId) {
    const names = [...CALL_NAMES, ...(botId ? [`<@!?${botId}>`] : [])].join('|');
    const match = content.match(new RegExp(`^(?:${names})\\s+(?=https?:\\/\\/)`, 'i'));
    return match ? content.slice(match[0].length) : null;
}

async function handleSocialEmbed(message) {
    if (!message.guild || message.author.bot || !message.content) return;
    if (!/(?:x|twitter|instagram|tiktok)\.com\//i.test(message.content)) return;

    const config = await getConfig(message.guild.id);
    if (!config.enabled) return;

    const content = config.trigger === 'auto' ? message.content : calledContent(message.content, message.client.user?.id);
    if (content === null) return;

    const links = findLinks(content, config);
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
            content: loading(`Fetching ${PLATFORM_NAMES[link.type]} post...`),
            allowedMentions: { repliedUser: false },
        }).catch(() => null);
        if (!status) return;

        try {
            const post = link.type === 'x'
                ? await fetchXPost(link.handle, link.id)
                : link.type === 'tiktok'
                    ? await fetchTikTokPost(link)
                    : await fetchInstagramPost(link.kind, link.id);

            const { files, skipped } = canAttach
                ? await downloadMedia(post, message.guild)
                : { files: [], skipped: post.media.map((m) => m.link ?? candidateUrl(m.candidates[0])) };

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
    calledContent,
    TRIGGERS,
    getConfig,
    setConfig,
    findLinks,
    parseInstagramEmbed,
    fetchXPost,
    fetchInstagramPost,
    fetchTikTokPost,
    buildContent,
    downloadMedia,
    uploadLimit,
};
