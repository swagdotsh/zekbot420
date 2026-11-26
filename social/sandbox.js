const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const SITE = 'https://sandbox.swagrelated.com';
const API = `${SITE}/api/v1`;
const TIMEOUT_MS = 10000;
const COLOR = 0x8b5cf6;
const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const USERNAME = /^[\w.-]{1,40}$/;

const BADGES = {
    verified: '☑️',
    developer: '🛠️',
    supporter: '💖',
    moderator: '🛡️',
    automated: '🤖',
    aiAgent: '✨',
};

const CATEGORY_NAMES = {
    general: 'General',
    sports: 'Sports',
    games: 'Games',
    'movies-tv': 'Movies & TV',
    music: 'Music',
    books: 'Books',
    creative: 'Creative',
};

const count = (n) => (Number.isFinite(n) ? COMPACT.format(n) : '—');
const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);
const ts = (date) => Math.floor(Date.parse(date) / 1000);

class SandboxError extends Error {}

async function request(pathname) {
    const headers = { Accept: 'application/json', 'User-Agent': 'zekbot420-discord-bot' };
    const token = process.env.SANDBOX_API_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(API + pathname, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return null;
    if (response.status === 403) return { forbidden: true };
    if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after'));
        throw new SandboxError(`sandbox is rate limiting me.${wait ? ` Try again in ${wait} seconds.` : ''}`);
    }
    if (response.status === 401) throw new SandboxError('The sandbox token in .env was rejected.');
    if (!response.ok) throw new Error(`sandbox API ${response.status}`);
    return response.json();
}

function parseUsername(input) {
    const text = String(input ?? '').trim().replace(/^@/, '');
    const fromLink = text.match(/sandbox\.swagrelated\.com\/(?:users|profile)\/([\w.-]{1,40})/i)?.[1];
    const name = fromLink ?? text;
    return USERNAME.test(name) ? name : null;
}

function parsePostId(input) {
    const text = String(input ?? '').trim();
    const id = text.match(/\/post\/(\d+)/)?.[1] ?? text.match(/^#?(\d{1,12})$/)?.[1];
    return id ?? null;
}

function absoluteLinks(text) {
    return String(text ?? '').replace(/\]\((\/[^)\s]*)\)/g, (_, path) => `](${SITE}${path})`);
}

function badgeText(badges = {}) {
    return Object.entries(BADGES).filter(([key]) => badges[key]).map(([, emoji]) => emoji).join(' ');
}

function postLine(post) {
    const text = clip(absoluteLinks(post.content).replace(/\s+/g, ' ').trim(), 80) || (post.files?.length ? '📷 Media' : 'Post');
    return `[${text.replace(/[[\]]/g, '')}](${post.url}) <t:${ts(post.createdAt)}:R> - ❤️ ${count(post.counts?.likes)}`;
}

async function profile(input) {
    const username = parseUsername(input);
    if (!username) return { error: 'Give a sandbox username or profile link.' };

    const user = await request(`/users/${encodeURIComponent(username)}`);
    if (!user) return { error: `There's no sandbox account called **@${username}**.` };

    const badges = badgeText(user.badges);
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: 'sandbox', url: SITE })
        .setTitle(clip(`${user.displayName || user.username}${badges ? ` ${badges}` : ''} (@${user.username})`, 256))
        .setURL(user.url);
    if (user.pfp) embed.setThumbnail(user.pfp);

    if (user.isPrivate) {
        embed.setDescription('🔒 This account is private.');
        return { embeds: [embed], components: [linkRow(user.url, 'Profile')] };
    }

    embed.setDescription(clip(absoluteLinks(user.bio)?.trim(), 1000) || '*No bio*');
    const fields = [
        { name: 'Followers', value: count(user.counts?.followers), inline: true },
        { name: 'Following', value: count(user.counts?.following), inline: true },
        { name: 'Posts', value: count(user.counts?.posts), inline: true },
        { name: 'Joined', value: `<t:${ts(user.createdAt)}:D>`, inline: true },
    ];
    if (user.pronouns) fields.push({ name: 'Pronouns', value: clip(user.pronouns, 40), inline: true });
    const links = (user.links ?? []).filter((l) => /^https?:\/\//.test(l.url)).slice(0, 5);
    if (links.length) fields.push({ name: 'Links', value: links.map((l) => `[${clip(l.label || l.url, 40).replace(/[[\]]/g, '')}](${l.url})`).join(' - ') });

    const posts = await request(`/users/${encodeURIComponent(user.username)}/posts?limit=3`).catch(() => null);
    if (posts?.data?.length) fields.push({ name: 'Latest posts', value: clip(posts.data.map(postLine).join('\n'), 1024) });

    embed.addFields(fields);
    if (user.banner) embed.setImage(user.banner);
    return { embeds: [embed], components: [linkRow(user.url, 'Profile')] };
}

async function post(input) {
    const id = parsePostId(input);
    if (!id) return { error: 'Give a sandbox post link or post number.' };

    const data = await request(`/posts/${id}`);
    if (!data || data.forbidden) return { error: 'That post doesn\'t exist or isn\'t public.' };

    const author = data.author ?? {};
    const badges = badgeText(author.badges);
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({
            name: clip(`${author.displayName || author.username}${badges ? ` ${badges}` : ''} (@${author.username})`, 256),
            iconURL: author.pfp ?? undefined,
            url: author.url,
        })
        .setURL(data.url)
        .setTimestamp(new Date(data.createdAt));

    const parts = [];
    if (data.replyTo) {
        const parent = await request(`/posts/${data.replyTo.id ?? data.replyTo}`).catch(() => null);
        parts.push(parent?.url
            ? `-# ↩️ Replying to [@${parent.author?.username ?? 'someone'}](${parent.url})`
            : '-# ↩️ Replying to a post that isn\'t public');
    }
    parts.push(clip(absoluteLinks(data.content), 3500) || '*No text*');
    if (data.quotedPost) {
        parts.push(data.quotedPost.unavailable
            ? '> *Quoted post unavailable*'
            : `> **@${data.quotedPost.author?.username ?? 'unknown'}:** ${clip(absoluteLinks(data.quotedPost.content).replace(/\n/g, ' '), 300)}`);
    }
    embed.setDescription(parts.join('\n\n'));

    const image = (data.files ?? []).find((f) => f.kind === 'image' && !f.spoiler);
    if (image) embed.setImage(image.url);
    const others = (data.files ?? []).filter((f) => f !== image);
    if (others.length) embed.addFields({ name: 'Attachments', value: others.slice(0, 5).map((f, i) => `[${f.spoiler ? '⚠️ spoiler ' : ''}${f.kind} ${i + 1}](${f.url})`).join(' - ') });

    embed.setFooter({
        text: [
            CATEGORY_NAMES[data.category] ?? data.category,
            `❤️ ${count(data.counts?.likes)}`,
            `💬 ${count(data.counts?.replies)}`,
            `🔁 ${count(data.counts?.reposts)}`,
            data.editedAt ? 'edited' : null,
        ].filter(Boolean).join(' - '),
    });

    return { embeds: [embed], components: [linkRow(data.url, 'View post')] };
}

function linkRow(url, label) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url));
}

module.exports = { profile, post, parseUsername, parsePostId, SandboxError };
