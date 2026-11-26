const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { createGuildStore } = require('./guildDataStore');

const MAX_PER_MESSAGE = 20;

const DANGEROUS_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.MentionEveryone,
];

const store = createGuildStore('reactionRoles.json', () => ({ messages: {} }));

const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\d{17,20})>$/;
const UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣)/u;

function emojiKey(emoji) {
    if (!emoji) return null;
    if (typeof emoji === 'string') {
        const custom = emoji.match(CUSTOM_EMOJI);
        return custom ? custom[3] : emoji.replace(/️/g, '');
    }
    return emoji.id ?? emoji.name?.replace(/️/g, '') ?? null;
}

function parseEmoji(input) {
    const text = String(input ?? '').trim();
    if (CUSTOM_EMOJI.test(text)) return { key: emojiKey(text), emoji: text };
    if (!UNICODE_EMOJI.test(text) || text.length > 16 || /\s/.test(text)) return null;
    const segments = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)];
    if (segments.length !== 1) return null;
    return { key: emojiKey(text), emoji: text };
}

const MESSAGE_LINK = /discord(?:app)?\.com\/channels\/(\d{17,20}|@me)\/(\d{17,20})\/(\d{17,20})/;

async function resolveMessage(interaction, input) {
    const text = String(input ?? '').trim();
    const link = text.match(MESSAGE_LINK);
    let channelId = interaction.channelId;
    let messageId = text;

    if (link) {
        if (link[1] !== interaction.guild.id) return { error: 'That message is in a different server.' };
        channelId = link[2];
        messageId = link[3];
    } else if (!/^\d{17,20}$/.test(text)) {
        return { error: 'Give a message link (right-click the message > Copy Message Link) or a message ID from this channel.' };
    }

    const channel = interaction.guild.channels.cache.get(channelId)
        ?? await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return { error: 'I can\'t find that channel.' };

    const perms = channel.permissionsFor(interaction.guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions])) {
        return { error: `I need the \`View Channel\`, \`Read Message History\` and \`Add Reactions\` permissions in ${channel}.` };
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return { error: 'I can\'t find that message.' };
    return { message };
}

function reactionRoleBlocker(member, role) {
    const guild = member.guild;
    const me = guild.members.me;
    if (role.id === guild.roles.everyone.id) return 'You can\'t use @everyone.';
    if (role.managed) return `${role} is managed by Discord or an integration and can't be given out.`;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return 'I need the `Manage Roles` permission.';
    if (role.position >= me.roles.highest.position) return `${role} is higher than or equal to my highest role. Move my role above it.`;
    if (member.id !== guild.ownerId && role.position >= member.roles.highest.position) return `${role} is higher than or equal to your highest role.`;
    if (DANGEROUS_PERMISSIONS.some((perm) => role.permissions.has(perm))) {
        return `${role} has moderator permissions, so I won't let anyone get it by reacting.`;
    }
    return null;
}

function canAssign(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    const me = guild.members.me;
    return Boolean(role && !role.managed && me?.permissions.has(PermissionFlagsBits.ManageRoles)
        && role.position < me.roles.highest.position);
}

function panelEmbed(entry, guild) {
    const lines = Object.values(entry.roles).map(({ roleId, emoji }) => `${emoji} <@&${roleId}>`);
    const firstRole = guild.roles.cache.get(Object.values(entry.roles)[0]?.roleId);
    const help = entry.unique ? 'React to pick a role. You can only have one of these at a time.' : 'React to get a role, remove your reaction to lose it.';
    return new EmbedBuilder()
        .setColor(firstRole?.color || 0x5865f2)
        .setTitle(entry.panel.title)
        .setDescription([entry.panel.description, lines.join('\n') || '*No roles yet. Add some with `/reactionrole add`.*'].filter(Boolean).join('\n\n').slice(0, 4096))
        .setFooter({ text: help });
}

async function refreshPanel(guild, messageId, entry) {
    if (!entry?.panel) return;
    const channel = guild.channels.cache.get(entry.channelId);
    const message = await channel?.messages?.fetch(messageId).catch(() => null);
    if (message?.editable) await message.edit({ embeds: [panelEmbed(entry, guild)] }).catch(() => {});
}

async function removeUserReactions(guild, channelId, messageId, userId, keys) {
    if (!keys.length) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) return;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;
    for (const reaction of message.reactions.cache.values()) {
        if (keys.includes(emojiKey(reaction.emoji))) await reaction.users.remove(userId).catch(() => {});
    }
}

let colorHandler = null;
function setColorHandler(handler) { colorHandler = handler; }

async function handleReaction(client, data, added) {
    if (!data.guild_id || data.user_id === client.user.id) return;
    if (added && data.member?.user?.bot) return;

    const guild = client.guilds.cache.get(data.guild_id);
    if (!guild) return;

    const key = emojiKey(data.emoji);
    const config = await store.get(guild.id);
    const entry = config.messages[data.message_id];

    if (!entry) {
        if (colorHandler) await colorHandler(guild, data, key, added);
        return;
    }

    const mapping = entry.roles[key];
    if (!mapping || !canAssign(guild, mapping.roleId)) return;

    const member = await guild.members.fetch(data.user_id).catch(() => null);
    if (!member || member.user.bot) return;

    if (!added) {
        if (member.roles.cache.has(mapping.roleId)) await member.roles.remove(mapping.roleId, 'Reaction role removed');
        return;
    }

    if (entry.unique) {
        const others = Object.entries(entry.roles).filter(([k, m]) => k !== key && member.roles.cache.has(m.roleId) && canAssign(guild, m.roleId));
        if (others.length) {
            await member.roles.remove(others.map(([, m]) => m.roleId), 'Reaction role switched');
            await removeUserReactions(guild, data.channel_id, data.message_id, member.id, others.map(([k]) => k));
        }
    }
    if (!member.roles.cache.has(mapping.roleId)) await member.roles.add(mapping.roleId, 'Reaction role');
}

async function forgetRole(guildId, roleId) {
    const changed = [];
    await store.update(guildId, (data) => {
        for (const [messageId, entry] of Object.entries(data.messages)) {
            for (const [key, mapping] of Object.entries(entry.roles)) {
                if (mapping.roleId === roleId) {
                    delete entry.roles[key];
                    changed.push([messageId, entry]);
                }
            }
        }
    });
    return changed;
}

async function forgetMessage(guildId, messageId) {
    const config = await store.get(guildId);
    if (!config.messages[messageId]) return;
    await store.update(guildId, (data) => { delete data.messages[messageId]; });
}

function registerReactionRoleEvents(client) {
    const run = (added) => (data) => {
        handleReaction(client, data, added).catch((error) => console.error('[reactionRoles] failed:', error));
    };
    client.ws.on('MESSAGE_REACTION_ADD', run(true));
    client.ws.on('MESSAGE_REACTION_REMOVE', run(false));

    client.on('roleDelete', (role) => {
        forgetRole(role.guild.id, role.id)
            .then((changed) => Promise.all(changed.map(([id, entry]) => refreshPanel(role.guild, id, entry))))
            .catch((error) => console.error('[reactionRoles] failed to forget a deleted role:', error));
    });
    client.on('messageDelete', (message) => {
        if (message.guildId) forgetMessage(message.guildId, message.id).catch(() => {});
    });
}

module.exports = {
    MAX_PER_MESSAGE,
    store,
    emojiKey,
    parseEmoji,
    resolveMessage,
    reactionRoleBlocker,
    canAssign,
    panelEmbed,
    refreshPanel,
    removeUserReactions,
    setColorHandler,
    registerReactionRoleEvents,
    handleReaction,
};
