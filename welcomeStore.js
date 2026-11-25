const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { readJson, updateJson } = require('./jsonStore');
const { DATA_DIR } = require('./paths');

const DEFAULT_WELCOME = {
    channelId: null,
    message: 'Welcome {user}!',
    embed: {
        enabled: true,
        title: 'Welcome {username}!',
        description: 'Enjoy your stay!',
        footer: '{server} is now at {membercount} members.',
        color: '#00ff88',
        image: null,
        avatar: true,
    },
};

const PLACEHOLDERS = {
    '{user}': 'mentions the new member',
    '{username}': 'their username',
    '{displayname}': 'their display name',
    '{server}': 'the server name',
    '{membercount}': 'member count, like 1234',
    '{membercount_ordinal}': 'member count, like 1234th',
};

const configPath = (guildId) => path.join(DATA_DIR, String(guildId), 'welcomeConfig.json');

function withDefaults(stored = {}) {
    return {
        ...DEFAULT_WELCOME,
        ...stored,
        embed: { ...DEFAULT_WELCOME.embed, ...(stored.embed ?? {}) },
    };
}

async function getWelcomeConfig(guildId) {
    return withDefaults(await readJson(configPath(guildId), {}));
}

async function updateWelcomeConfig(guildId, mutate) {
    const next = await updateJson(configPath(guildId), {}, async (current) => {
        const config = withDefaults(current);
        return (await mutate(config)) ?? config;
    });
    return withDefaults(next);
}

function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

function fillPlaceholders(text, member) {
    if (!text) return text;
    const count = member.guild.memberCount;
    const values = {
        '{user}': `${member}`,
        '{mention}': `${member}`,
        '{username}': member.user.username,
        '{displayname}': member.displayName,
        '{server}': member.guild.name,
        '{membercount}': count.toLocaleString('en-US'),
        '{membercount_ordinal}': ordinal(count),
    };
    return text.replace(/\{[a-z_]+\}/gi, (token) => values[token.toLowerCase()] ?? token);
}

const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

function buildWelcomeMessage(member, config) {
    const content = clip(fillPlaceholders(config.message, member), 2000) || undefined;
    const embeds = [];

    if (config.embed.enabled) {
        const { title, description, footer, color, image, avatar } = config.embed;
        const embed = new EmbedBuilder()
            .setColor(color || DEFAULT_WELCOME.embed.color)
            .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL() ?? undefined });

        if (title) embed.setTitle(clip(fillPlaceholders(title, member), 256));
        if (description) embed.setDescription(clip(fillPlaceholders(description, member), 4096));
        if (footer) embed.setFooter({ text: clip(fillPlaceholders(footer, member), 2048) });
        if (avatar) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
        if (image) embed.setImage(image);
        embeds.push(embed);
    }

    return { content, embeds, allowedMentions: { users: [member.id] } };
}

function isValidHexColor(value) {
    return /^#?[0-9a-f]{6}$/i.test(value);
}

function normalizeHexColor(value) {
    return `#${value.replace('#', '').toLowerCase()}`;
}

module.exports = {
    DEFAULT_WELCOME,
    PLACEHOLDERS,
    getWelcomeConfig,
    updateWelcomeConfig,
    buildWelcomeMessage,
    fillPlaceholders,
    isValidHexColor,
    normalizeHexColor,
};
