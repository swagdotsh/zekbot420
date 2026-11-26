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

const DEFAULT_GOODBYE = {
    channelId: null,
    message: null,
    embed: {
        enabled: true,
        title: 'Goodbye {username}',
        description: '{displayname} has left the server. We\'ll miss you!',
        footer: '{server} now has {membercount} members.',
        color: '#ff5c5c',
        image: null,
        avatar: true,
    },
};

const DEFAULT_BOOST = {
    channelId: null,
    message: '{user}',
    embed: {
        enabled: true,
        title: 'Thanks for boosting, {displayname}!',
        description: '{server} now has {boostcount} boosts (level {boostlevel}). We appreciate you!',
        footer: null,
        color: '#f47fff',
        image: null,
        avatar: true,
    },
};

const DEFAULTS = { welcome: DEFAULT_WELCOME, goodbye: DEFAULT_GOODBYE, boost: DEFAULT_BOOST };

const PLACEHOLDERS = {
    '{user}': 'mentions the new member',
    '{username}': 'their username',
    '{displayname}': 'their display name',
    '{server}': 'the server name',
    '{membercount}': 'member count, like 1234',
    '{membercount_ordinal}': 'member count, like 1234th',
};

const EXTRA_PLACEHOLDERS = {
    boost: {
        '{boostcount}': 'how many boosts the server has',
        '{boostlevel}': 'the server boost level (0-3)',
    },
};

const placeholdersFor = (kind) => ({ ...PLACEHOLDERS, ...(EXTRA_PLACEHOLDERS[kind] ?? {}) });

const configPath = (guildId, kind) => path.join(DATA_DIR, String(guildId), `${kind}Config.json`);

function withDefaults(stored = {}, kind = 'welcome') {
    const defaults = DEFAULTS[kind];
    return {
        ...defaults,
        ...stored,
        embed: { ...defaults.embed, ...(stored.embed ?? {}) },
    };
}

async function getMessageConfig(guildId, kind) {
    return withDefaults(await readJson(configPath(guildId, kind), {}), kind);
}

async function updateMessageConfig(guildId, kind, mutate) {
    const next = await updateJson(configPath(guildId, kind), {}, async (current) => {
        const config = withDefaults(current, kind);
        return (await mutate(config)) ?? config;
    });
    return withDefaults(next, kind);
}

const getWelcomeConfig = (guildId) => getMessageConfig(guildId, 'welcome');
const updateWelcomeConfig = (guildId, mutate) => updateMessageConfig(guildId, 'welcome', mutate);

function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

function fillPlaceholders(text, member) {
    if (!text) return text;
    const count = member.guild.memberCount;
    const user = member.user ?? {};
    const values = {
        '{user}': `${member}`,
        '{mention}': `${member}`,
        '{username}': user.username ?? 'unknown',
        '{displayname}': member.displayName ?? user.globalName ?? user.username ?? 'unknown',
        '{server}': member.guild.name,
        '{membercount}': count.toLocaleString('en-US'),
        '{membercount_ordinal}': ordinal(count),
        '{boostcount}': String(member.guild.premiumSubscriptionCount ?? 0),
        '{boostlevel}': String(member.guild.premiumTier ?? 0),
    };
    return text.replace(/\{[a-z_]+\}/gi, (token) => values[token.toLowerCase()] ?? token);
}

const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

function buildMemberMessage(member, config) {
    const content = clip(fillPlaceholders(config.message, member), 2000) || undefined;
    const embeds = [];

    if (config.embed.enabled) {
        const { title, description, footer, color, image, avatar } = config.embed;
        const embed = new EmbedBuilder()
            .setColor(color || '#00ff88')
            .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL() ?? undefined });

        if (title) embed.setTitle(clip(fillPlaceholders(title, member), 256));
        if (description) embed.setDescription(clip(fillPlaceholders(description, member), 4096));
        if (footer) embed.setFooter({ text: clip(fillPlaceholders(footer, member), 2048) });
        if (avatar && member.user) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
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
    DEFAULTS,
    DEFAULT_WELCOME,
    DEFAULT_GOODBYE,
    DEFAULT_BOOST,
    PLACEHOLDERS,
    placeholdersFor,
    getMessageConfig,
    updateMessageConfig,
    getWelcomeConfig,
    updateWelcomeConfig,
    buildMemberMessage,
    buildWelcomeMessage: buildMemberMessage,
    fillPlaceholders,
    isValidHexColor,
    normalizeHexColor,
};
