const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { EMOJI, emojiUrl } = require('../ui');

const TIMEOUT_MS = 10000;
const ATTEMPTS = 5;
const USER_AGENT = 'zekbot420 (Discord bot; +https://github.com/swagdotsh/zekbot420)';
const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const HANDLE = /^\w{1,15}$/;

const count = (n) => (Number.isFinite(n) ? COMPACT.format(n) : '—');
const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

function parseHandle(input) {
    const text = String(input ?? '').trim().replace(/^@/, '');
    const fromLink = text.match(/(?:x|twitter)\.com\/(\w{1,15})(?:[/?#]|$)/i)?.[1];
    const handle = fromLink ?? text;
    return HANDLE.test(handle) ? handle : null;
}

async function fetchUser(handle) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const response = await fetch(`https://api.fxtwitter.com/2/profile/${handle}`, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status !== 404 && !response.ok) throw new Error(`FxTwitter ${response.status}`);
        const body = await response.json().catch(() => null);
        if (body?.code !== 404 && body?.user) return body.user;
    }
    return null;
}

async function profile(input) {
    const handle = parseHandle(input);
    if (!handle) return { error: 'Give an X username or profile link, like `@github`.' };

    const user = await fetchUser(handle);
    if (!user) return { error: `There's no X account called **@${handle}**.` };

    const url = user.url || `https://x.com/${user.screen_name}`;
    const verified = user.verification?.verified
        ? ({ organization: ' 🟨', government: ' 🩶' }[user.verification.type] ?? ' ☑️')
        : '';
    const joined = Date.parse(user.joined);

    const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setAuthor({ name: 'X', iconURL: emojiUrl(EMOJI.x) })
        .setTitle(`${user.name}${verified} (@${user.screen_name})`)
        .setURL(url)
        .setThumbnail(user.avatar_url?.replace('_normal.', '_400x400.') ?? null)
        .setDescription([user.protected && '🔒 Posts are protected', clip(user.description?.trim(), 800) || '*No bio*'].filter(Boolean).join('\n'))
        .addFields(
            { name: 'Followers', value: count(user.followers), inline: true },
            { name: 'Following', value: count(user.following), inline: true },
            { name: 'Posts', value: count(user.statuses ?? user.tweets), inline: true },
            { name: 'Likes', value: count(user.likes), inline: true },
            { name: 'Media', value: count(user.media_count), inline: true },
            { name: 'Joined', value: Number.isFinite(joined) ? `<t:${Math.floor(joined / 1000)}:D>` : 'Unknown', inline: true },
        );

    const about = [
        user.location && `📍 ${clip(user.location, 80)}`,
        user.website?.url && `🔗 ${clip(user.website.display_url || user.website.url, 80)}`,
    ].filter(Boolean);
    if (about.length) embed.addFields({ name: 'About', value: about.join('\n') });
    if (user.banner_url) embed.setImage(`${user.banner_url}/1500x500`);

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Profile').setURL(url),
    );
    if (user.website?.url && /^https?:\/\//.test(user.website.url)) {
        buttons.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Website').setURL(user.website.url));
    }
    return { embeds: [embed], components: [buttons] };
}

module.exports = { profile, parseHandle };
