const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { fetchLimited } = require('../safeFetch');
const { EMOJI, emojiUrl } = require('../ui');

const USER_AGENT = 'zekbot420 (Discord bot; +https://github.com/swagdotsh/zekbot420)';
const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const USERNAME = /^[\w](?:[\w.]{0,28}[\w])?$/;

const count = (n) => (Number.isFinite(n) ? COMPACT.format(n) : '—');
const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

function parseUsername(input) {
    const text = String(input ?? '').trim().replace(/^@/, '');
    const fromLink = text.match(/instagram\.com\/([\w.]{1,30})(?:[/?#]|$)/i)?.[1];
    const name = (fromLink ?? text).toLowerCase();
    if (['p', 'reel', 'reels', 'tv', 'explore', 'stories'].includes(name)) return null;
    return USERNAME.test(name) ? name : null;
}

function readContext(html) {
    const raw = html.match(/"contextJSON":("(?:[^"\\]|\\.)*")/)?.[1];
    if (!raw) return null;
    try {
        return JSON.parse(JSON.parse(raw)).context ?? null;
    } catch {
        return null;
    }
}

async function profile(input) {
    const username = parseUsername(input);
    if (!username) return { error: 'Give an Instagram username or profile link, like `@instagram`.' };

    let body;
    try {
        body = await fetchLimited(`https://www.instagram.com/${username}/embed/`, {
            maxBytes: 3 * 1024 * 1024,
            timeoutMs: 10000,
            headers: { 'User-Agent': USER_AGENT },
        });
    } catch (error) {
        if (/HTTP 404/.test(error.message)) return { error: `There's no Instagram account called **@${username}**.` };
        throw error;
    }
    const context = readContext(body.toString('utf8'));
    if (!context?.username) return { error: `I couldn't find an Instagram account called **@${username}**, or Instagram didn't share it.` };

    const url = `https://www.instagram.com/${context.username}/`;
    const verified = context.is_verified || context.verified ? ' ☑️' : '';
    const posts = (context.graphql_media ?? []).map((m) => m.shortcode_media).filter(Boolean);

    const embed = new EmbedBuilder()
        .setColor(0xe1306c)
        .setAuthor({ name: 'Instagram', iconURL: emojiUrl(EMOJI.instagram) })
        .setTitle(`${context.full_name || context.username}${verified} (@${context.username})`)
        .setURL(url)
        .addFields(
            { name: 'Followers', value: count(context.followers_count), inline: true },
            { name: 'Posts', value: count(context.posts_count), inline: true },
        );
    if (context.profile_pic_url) embed.setThumbnail(context.profile_pic_url);
    if (context.pronouns?.length) embed.addFields({ name: 'Pronouns', value: context.pronouns.join('/'), inline: true });

    if (posts.length) {
        const lines = posts.slice(0, 3).map((post) => {
            const caption = post.edge_media_to_caption?.edges?.[0]?.node?.text?.replace(/\s+/g, ' ').trim();
            const when = post.taken_at_timestamp ? ` <t:${post.taken_at_timestamp}:R>` : '';
            const likes = post.edge_liked_by?.count != null && !post.like_and_view_counts_disabled ? ` - ❤️ ${count(post.edge_liked_by.count)}` : '';
            return `[${post.is_video ? '🎬' : '📷'} ${clip(caption, 70) || 'Post'}](https://www.instagram.com/p/${post.shortcode}/)${when}${likes}`;
        });
        embed.addFields({ name: 'Latest posts', value: lines.join('\n') });
        if (posts[0].display_url) embed.setImage(posts[0].display_url);
    } else {
        embed.setDescription('*No public posts to show (the account may be private).*');
    }

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Profile').setURL(url),
    );
    return { embeds: [embed], components: [buttons] };
}

module.exports = { profile, parseUsername };
