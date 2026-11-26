const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { createGuildStore } = require('./guildDataStore');
const { MAX_PER_MESSAGE, emojiKey, canAssign, removeUserReactions, setColorHandler } = require('./reactionRoles');

const MAX_COLORS = 60;

const store = createGuildStore('colorRoles.json', () => ({
    channelId: null,
    messageIds: [],
    colors: [],
}));

const NAMED_COLORS = {
    red: '#e74c3c', crimson: '#dc143c', maroon: '#800000', orange: '#e67e22', gold: '#f1c40f',
    yellow: '#fee75c', lime: '#a3e635', green: '#2ecc71', 'dark green': '#1f8b4c', mint: '#98ff98',
    teal: '#1abc9c', cyan: '#00e5ff', aqua: '#00ffff', 'sky blue': '#87ceeb', blue: '#3498db',
    'dark blue': '#206694', navy: '#000080', blurple: '#5865f2', indigo: '#4b0082', purple: '#9b59b6',
    violet: '#8f00ff', lavender: '#b57edc', magenta: '#ff00ff', pink: '#ff69b4', 'hot pink': '#ff1493',
    rose: '#ff66cc', peach: '#ffb07c', brown: '#8b5a2b', tan: '#d2b48c', beige: '#f5f5dc',
    white: '#fffffe', silver: '#c0c0c0', grey: '#95a5a6', gray: '#95a5a6', black: '#010101',
};

function parseColor(input) {
    const text = String(input ?? '').trim().toLowerCase();
    let hex = NAMED_COLORS[text] ?? NAMED_COLORS[text.replace(/[-_]/g, ' ')];
    if (!hex) {
        const short = text.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
        const full = text.match(/^#?([0-9a-f]{6})$/);
        if (short) hex = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
        else if (full) hex = `#${full[1]}`;
    }
    if (!hex) return null;
    return hex === '#000000' ? '#010101' : hex;
}

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const EMOJI_PALETTE = [
    ['🔴', '#dd2e44'], ['🟠', '#f4900c'], ['🟡', '#fdcb58'], ['🟢', '#78b159'], ['🔵', '#55acee'],
    ['🟣', '#aa8ed6'], ['🟤', '#c1694f'], ['⚫', '#31373d'], ['⚪', '#e6e7e8'],
    ['❤️', '#dd2e44'], ['🧡', '#f4900c'], ['💛', '#fdcb58'], ['💚', '#78b159'], ['💙', '#5dadec'],
    ['💜', '#aa8ed6'], ['🤎', '#c1694f'], ['🖤', '#292f33'], ['🤍', '#ffffff'], ['🩷', '#ff8fc8'],
    ['🩵', '#74ccf4'], ['🩶', '#99aab5'],
    ['🟥', '#dd2e44'], ['🟧', '#f4900c'], ['🟨', '#fdcb58'], ['🟩', '#78b159'], ['🟦', '#55acee'],
    ['🟪', '#aa8ed6'], ['🟫', '#c1694f'], ['⬛', '#292f33'], ['⬜', '#e6e7e8'],
    ['🍓', '#be1931'], ['🍊', '#f4900c'], ['🍋', '#ffcc4d'], ['🍏', '#77b255'], ['🫐', '#5865c9'],
    ['🍇', '#744eaa'], ['🌸', '#f7b6c8'], ['🌊', '#3b88c3'], ['🔥', '#f4900c'], ['❄️', '#88c9f9'],
    ['🍑', '#ffac33'], ['🥝', '#77b255'], ['🌻', '#ffcc4d'], ['🍆', '#744eaa'], ['🌹', '#be1931'],
    ['🍫', '#8a4b38'], ['🧊', '#bbddf5'], ['🌿', '#5c913b'], ['💎', '#55acee'], ['🌙', '#ffd983'],
    ['🎀', '#ea596e'], ['🦩', '#f19cb7'], ['🐸', '#77b255'], ['🍒', '#be1931'], ['🥥', '#a0522d'],
    ['🌌', '#2b2d6e'], ['☁️', '#e1e8ed'], ['🌵', '#5c913b'], ['🍁', '#dd2e44'], ['🪻', '#8f6ac8'],
];

const PLAIN_EMOJI_COUNT = 21;

function pickEmoji(hex, usedKeys) {
    const [r, g, b] = toRgb(hex);
    let best = null;
    for (const [index, [emoji, color]] of EMOJI_PALETTE.entries()) {
        if (usedKeys.has(emojiKey(emoji))) continue;
        const [r2, g2, b2] = toRgb(color);
        const preference = index < PLAIN_EMOJI_COUNT ? 0.6 : 1;
        const distance = preference * (2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2);
        if (!best || distance < best.distance) best = { emoji, distance };
    }
    return best?.emoji ?? null;
}

const locks = new Map();
function withGuildLock(guildId, task) {
    const previous = locks.get(guildId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    locks.set(guildId, next.finally(() => { if (locks.get(guildId) === next) locks.delete(guildId); }));
    return next;
}

function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out.length ? out : [[]];
}

function panelEmbed(colors, index, total) {
    const embed = new EmbedBuilder()
        .setColor(colors.length ? parseInt(colors[colors.length - 1].hex.slice(1), 16) : 0x2b2d31)
        .setDescription(colors.length
            ? colors.map((c) => `${c.emoji} <@&${c.roleId}> \`${c.hex}\``).join('\n')
            : '*No colors yet. Add one with `/colorrole add`.*');
    if (index === 0) embed.setTitle('🎨 Pick your color');
    if (index === total - 1) embed.setFooter({ text: 'React to pick a color. Picking another switches it, removing your reaction takes it off.' });
    return embed;
}

async function createColorsChannel(guild) {
    const me = guild.members.me;
    return guild.channels.create({
        name: 'colors',
        type: ChannelType.GuildText,
        topic: 'React to pick a name color.',
        reason: 'Color roles panel',
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] },
            { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
        ],
    });
}

function missingPanelPerms(channel, me) {
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory];
    return !channel.permissionsFor(me)?.has(needed);
}

function syncPanel(guild, { createChannel = false, channel: newChannel = null } = {}) {
    return withGuildLock(guild.id, async () => {
        const config = await store.get(guild.id);
        let channel = newChannel ?? guild.channels.cache.get(config.channelId);
        const oldMessageIds = newChannel && newChannel.id !== config.channelId ? config.messageIds : null;

        if (!channel) {
            if (!createChannel) return null;
            channel = await createColorsChannel(guild);
        }
        if (missingPanelPerms(channel, guild.members.me)) {
            throw new Error(`I need the View Channel, Send Messages, Embed Links, Add Reactions and Read Message History permissions in #${channel.name}.`);
        }

        if (oldMessageIds?.length) {
            const oldChannel = guild.channels.cache.get(config.channelId);
            for (const id of oldMessageIds) await oldChannel?.messages.delete(id).catch(() => {});
        }
        const existingIds = oldMessageIds ? [] : [...config.messageIds];

        const groups = chunk(config.colors, MAX_PER_MESSAGE);
        const messageIds = [];
        const canManage = channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageMessages);

        for (let i = 0; i < groups.length; i++) {
            const colors = groups[i];
            const payload = { embeds: [panelEmbed(colors, i, groups.length)], allowedMentions: { parse: [] } };
            let message = existingIds[i] ? await channel.messages.fetch(existingIds[i]).catch(() => null) : null;
            if (message) await message.edit(payload);
            else message = await channel.send(payload);
            messageIds.push(message.id);

            const wanted = colors.map((c) => c.key);
            for (const reaction of message.reactions.cache.values()) {
                if (!wanted.includes(emojiKey(reaction.emoji))) {
                    if (canManage) await reaction.remove().catch(() => {});
                    else await reaction.users.remove(guild.members.me.id).catch(() => {});
                }
            }
            for (const color of colors) {
                const reaction = message.reactions.cache.find((r) => emojiKey(r.emoji) === color.key);
                if (!reaction?.me) await message.react(color.emoji).catch((error) => {
                    console.error(`[colorRoles] couldn't react with ${color.emoji}:`, error.message);
                });
            }
        }

        for (const id of existingIds.slice(groups.length)) await channel.messages.delete(id).catch(() => {});

        await store.update(guild.id, (data) => {
            data.channelId = channel.id;
            data.messageIds = messageIds;
        });
        return channel;
    });
}

async function handleColorReaction(guild, data, key, added) {
    const config = await store.get(guild.id);
    if (!config.messageIds.includes(data.message_id)) return;

    const color = config.colors.find((c) => c.key === key);
    if (!color || !canAssign(guild, color.roleId)) return;

    const member = await guild.members.fetch(data.user_id).catch(() => null);
    if (!member || member.user.bot) return;

    if (!added) {
        if (member.roles.cache.has(color.roleId)) await member.roles.remove(color.roleId, 'Color role removed');
        return;
    }

    const others = config.colors.filter((c) => c.roleId !== color.roleId && member.roles.cache.has(c.roleId) && canAssign(guild, c.roleId));
    const nextRoles = member.roles.cache
        .filter((role) => !others.some((c) => c.roleId === role.id))
        .map((role) => role.id);
    if (!nextRoles.includes(color.roleId)) nextRoles.push(color.roleId);
    if (others.length || !member.roles.cache.has(color.roleId)) await member.roles.set(nextRoles, 'Color role picked');

    for (const other of others) {
        const index = config.colors.findIndex((c) => c.roleId === other.roleId);
        const messageId = config.messageIds[Math.floor(index / MAX_PER_MESSAGE)];
        if (messageId) await removeUserReactions(guild, config.channelId, messageId, member.id, [other.key]);
    }
}

setColorHandler(handleColorReaction);

async function addColor(guild, { name, hex, emoji = null, key = null, actor }) {
    const config = await store.get(guild.id);
    if (config.colors.length >= MAX_COLORS) throw new Error(`You can have up to ${MAX_COLORS} color roles.`);
    if (config.colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error(`There's already a color called **${name}**.`);

    const usedKeys = new Set(config.colors.map((c) => c.key));
    if (emoji) {
        if (usedKeys.has(key)) throw new Error(`${emoji} is already used for another color.`);
    } else {
        emoji = pickEmoji(hex, usedKeys);
        if (!emoji) throw new Error('I ran out of emoji to pick from. Give this color an `emoji`.');
        key = emojiKey(emoji);
    }

    const me = guild.members.me;
    const role = await guild.roles.create({
        name,
        colors: { primaryColor: parseInt(hex.slice(1), 16) },
        permissions: [],
        hoist: false,
        mentionable: false,
        reason: `Color role added by ${actor?.tag ?? 'a moderator'}`,
    });

    let positioned = true;
    try {
        await guild.roles.fetch();
        await role.setPosition(Math.max(1, me.roles.highest.position - 1), { reason: 'Color roles sit high so the color shows' });
    } catch {
        positioned = false;
    }

    await store.update(guild.id, (data) => {
        data.colors.push({ roleId: role.id, name, hex, emoji, key });
    });
    return { role, emoji, positioned };
}

async function removeColor(guild, roleId, { deleteRole = true } = {}) {
    let removed = null;
    await store.update(guild.id, (data) => {
        removed = data.colors.find((c) => c.roleId === roleId) ?? null;
        data.colors = data.colors.filter((c) => c.roleId !== roleId);
    });
    if (removed && deleteRole) {
        await guild.roles.cache.get(roleId)?.delete('Color role removed').catch(() => {});
    }
    return removed;
}

async function disablePanel(guild) {
    const config = await store.get(guild.id);
    const channel = guild.channels.cache.get(config.channelId);
    for (const id of config.messageIds) await channel?.messages.delete(id).catch(() => {});
    await store.update(guild.id, (data) => { data.channelId = null; data.messageIds = []; });
    return config;
}

function registerColorRoleEvents(client) {
    client.on('roleDelete', async (role) => {
        try {
            const config = await store.get(role.guild.id);
            if (!config.colors.some((c) => c.roleId === role.id)) return;
            await removeColor(role.guild, role.id, { deleteRole: false });
            await syncPanel(role.guild);
        } catch (error) {
            console.error('[colorRoles] failed to update after a role was deleted:', error);
        }
    });
}

module.exports = {
    MAX_COLORS,
    NAMED_COLORS,
    store,
    parseColor,
    pickEmoji,
    syncPanel,
    addColor,
    removeColor,
    disablePanel,
    registerColorRoleEvents,
};
