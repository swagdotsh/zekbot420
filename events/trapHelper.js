const fs = require('fs');
const path = require('path');
const { ChannelType, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { updateJson } = require('../jsonStore');
const { DATA_DIR: PROJECT_DATA_DIR } = require('../paths');

const dataDir = PROJECT_DATA_DIR;

function guildDir(guildId) {
    return path.join(dataDir, String(guildId));
}

function guildConfigPath(guildId) {
    return path.join(guildDir(guildId), 'modlog.json');
}

async function readGuildConfigFromDisk(guildId) {
    const cfgPath = guildConfigPath(guildId);

    try {
        if (!fs.existsSync(cfgPath)) {
            return {
                channelId: null,
                trapChannelId: null,
                trapExemptRoleIds: [],
                trapBanCount: 0,
            };
        }

        const txt = await fs.promises.readFile(cfgPath, 'utf8');
        if (!txt.trim()) {
            return {
                channelId: null,
                trapChannelId: null,
                trapExemptRoleIds: [],
                trapBanCount: 0,
            };
        }

        const parsed = JSON.parse(txt);

        return {
            channelId: parsed?.channelId ?? null,
            trapChannelId: parsed?.trapChannelId ?? null,
            trapExemptRoleIds: Array.isArray(parsed?.trapExemptRoleIds) ? parsed.trapExemptRoleIds : [],
            trapBanCount: Number.isInteger(parsed?.trapBanCount) ? parsed.trapBanCount : 0,
        };
    } catch {
        return {
            channelId: null,
            trapChannelId: null,
            trapExemptRoleIds: [],
            trapBanCount: 0,
        };
    }
}

const CONFIG_CACHE_MS = 30 * 1000;
const configCache = new Map();

async function readGuildConfig(guildId) {
    const key = String(guildId);
    const cached = configCache.get(key);
    if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) return structuredClone(cached.config);

    const config = await readGuildConfigFromDisk(guildId);
    configCache.set(key, { config, at: Date.now() });
    return structuredClone(config);
}

async function writeGuildConfig(guildId, config) {
    const dir = guildDir(guildId);
    const cfgPath = guildConfigPath(guildId);

    await fs.promises.mkdir(dir, { recursive: true });
    await updateJson(cfgPath, {}, (current) => ({ ...current, ...config }));
    configCache.delete(String(guildId));
}

async function incrementTrapBanCount(guildId) {
    await fs.promises.mkdir(guildDir(guildId), { recursive: true });
    const next = await updateJson(guildConfigPath(guildId), {}, (current) => ({
        ...current,
        trapBanCount: (Number.isInteger(current.trapBanCount) ? current.trapBanCount : 0) + 1,
    }));
    configCache.delete(String(guildId));
    return next.trapBanCount;
}

function truncate(value, maxLength = 1024) {
    const text = value?.length ? String(value) : '*No content*';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function memberHasExemptRole(member, exemptRoleIds) {
    if (!member || !Array.isArray(exemptRoleIds) || !exemptRoleIds.length) return false;
    return exemptRoleIds.some(roleId => member.roles.cache.has(roleId));
}

async function sendTrapLog(message, evidence, banCount) {
    const config = await readGuildConfig(message.guild.id);
    if (!config.channelId) return;

    const modlogChannel = message.guild.channels.cache.get(config.channelId);
    if (!modlogChannel?.isTextBased?.()) return;

    const attachmentText = evidence.attachments.length
        ? evidence.attachments.map((attachment, index) => `${index + 1}. ${attachment.name ?? 'Attachment'}: ${attachment.url}`).join('\n')
        : '*No attachments*';

    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('Trap Channel Triggered')
        .setAuthor({
            name: evidence.userTag,
            iconURL: message.author.displayAvatarURL?.() ?? undefined,
        })
        .addFields(
            { name: 'User', value: `${evidence.userTag} (${evidence.userId})`, inline: true },
            { name: 'Channel', value: `${message.channel.name} (${message.channel.id})`, inline: true },
            { name: 'Time', value: `<t:${Math.floor(evidence.createdTimestamp / 1000)}:F>`, inline: false },
            { name: 'Message Content', value: truncate(evidence.content), inline: false },
            { name: 'Attachments', value: truncate(attachmentText), inline: false },
            { name: 'Action', value: 'User banned automatically for trap channel trigger.', inline: false },
            { name: 'Trap Bans', value: String(banCount), inline: true },
        )
        .setTimestamp();

    await modlogChannel.send({ embeds: [embed] }).catch(err => {
        console.error('Failed to send trap modlog:', err);
    });
}

async function handleTrapMessage(message) {
    if (!message.guild) return;

    const config = await readGuildConfig(message.guild.id);

    if (!config.trapChannelId) return;
    if (message.channel.id !== config.trapChannelId) return;
    if (message.author.bot) return;
    if (message.webhookId) return;

    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);

    if (memberHasExemptRole(member, config.trapExemptRoleIds)) return;

    if (member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

    if (member && !member.bannable) {
        await message.delete().catch(() => null);
        console.warn(`Trap triggered by ${message.author.tag} in ${message.guild.id}, but they're above the bot and can't be banned.`);
        return;
    }

    const evidence = {
        content: message.content ?? '',
        attachments: message.attachments.map(attachment => ({
            name: attachment.name,
            url: attachment.url,
            contentType: attachment.contentType,
            size: attachment.size,
        })),
        userTag: message.author.tag,
        userId: message.author.id,
        createdTimestamp: message.createdTimestamp ?? Date.now(),
    };

    const reason = 'Trap channel trigger - suspected compromised account';

    await message.author.send(
        `You have been banned from **${message.guild.name}** because your account posted in a restricted server safety channel. ` +
        'This is treated as a compromised-account/spam signal.'
    ).catch(() => null);

    await message.delete().catch(() => null);

    await message.guild.members.ban(message.author.id, { reason });

    const banCount = await incrementTrapBanCount(message.guild.id);
    await sendTrapLog(message, evidence, banCount);
}

async function createTrapChannel(message, requestedName) {
    const guild = message.guild;
    const config = await readGuildConfig(guild.id);

    const channelName = requestedName?.trim()?.length
        ? requestedName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 90)
        : 'community-updates';

    const botMember = guild.members.me ?? await guild.members.fetchMe();

    const staffRoleIds = Array.isArray(config.trapExemptRoleIds) ? config.trapExemptRoleIds : [];

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
            ],
        },
        {
            id: botMember.roles.highest.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.BanMembers,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AttachFiles,
            ],
        },
        ...staffRoleIds.map(roleId => ({
            id: roleId,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
            ],
        })),
    ];

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        reason: `Trap channel created by ${message.author.tag}`,
        permissionOverwrites,
    });

    await channel.send(
        '# DO NOT SEND MESSAGES IN THIS CHANNEL\n' +
        'This is a trap channel designed to catch compromised accounts. Compromised accounts tend to be automated and send messages in every channel they have access to.\n **If you send a message here, you will be automatically banned.**'
    ).catch(err => {
        console.error('Failed to send trap channel warning message:', err);
    });

    config.trapChannelId = channel.id;
    config.trapExemptRoleIds = staffRoleIds;
    config.trapBanCount = Number.isInteger(config.trapBanCount) ? config.trapBanCount : 0;

    await writeGuildConfig(guild.id, config);

    return channel;
}

async function removeTrapChannelConfig(guildId) {
    const config = await readGuildConfig(guildId);
    const oldChannelId = config.trapChannelId;

    config.trapChannelId = null;
    await writeGuildConfig(guildId, config);

    return oldChannelId;
}

module.exports = {
    readGuildConfig,
    writeGuildConfig,
    handleTrapMessage,
    createTrapChannel,
    removeTrapChannelConfig,
};