const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEGACY_MODLOG_CONFIG_PATH = path.join(DATA_DIR, 'modlogConfig.json');
const CLEARED_DIR = path.join(DATA_DIR, 'cleared_messages');

const GUILD_CONFIG_FILE_NAME = 'modlog.json';

const modlogConfigCacheByGuild = new Map();

function nowStamp() {
  return new Date().toISOString();
}

function debugCreated(label, createdPath) {
  console.info(`[debug ${nowStamp()}] created ${label} at: ${createdPath}`);
}

async function ensureDir(dirPath, labelForDebug = 'directory') {
  const existed = await fsp
      .stat(dirPath)
      .then(function(s) { return s.isDirectory() })
      .catch(() => false);

  await fsp.mkdir(dirPath, { recursive: true });

  if (!existed) debugCreated(labelForDebug, dirPath);
}

function safeTag(userLike) {
  return userLike?.tag ?? userLike?.user?.tag ?? 'Unknown';
}

function safeAvatarURL(userLike) {
  try {
    return userLike?.displayAvatarURL?.() ?? null;
  } catch {
    return null;
  }
}

function guildDir(guildId) {
  return path.join(DATA_DIR, String(guildId));
}

function guildModlogConfigPath(guildId) {
  return path.join(guildDir(guildId), GUILD_CONFIG_FILE_NAME);
}

async function migrateLegacyModlogConfigOnce() {
  const legacyStat = await fsp.stat(LEGACY_MODLOG_CONFIG_PATH).catch(function() { return null });
  if (!legacyStat) return;

  try {
    const raw = await fsp.readFile(LEGACY_MODLOG_CONFIG_PATH, 'utf8').catch(() => '');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return;

    const entries = Object.entries(parsed);
    for (const [guildId, channelId] of entries) {
      if (!guildId) continue;
      const dir = guildDir(guildId);
      const newPath = guildModlogConfigPath(guildId);

      await ensureDir(dir, `guild data folder (${guildId})`);

      const existsNew = await fsp.stat(newPath).then(() => true).catch(() => false);
      if (existsNew) continue;

      const payload = JSON.stringify({ channelId: String(channelId) }, null, 2);
      await fsp.writeFile(newPath, payload, 'utf8');
      debugCreated(`modlog config file for guild ${guildId}`, newPath);
    }

    console.info(
        `[debug ${nowStamp()}] legacy modlogConfig.json was detected and migrated to per-guild folders (legacy file kept): ${LEGACY_MODLOG_CONFIG_PATH}`
    );
  } catch (err) {
    console.error('Failed to migrate legacy modlog config:', err);
  }
}

async function loadGuildModlogConfig(guildId) {
  try {
    if (!guildId) return {};

    await ensureDir(DATA_DIR, 'data folder');
    await migrateLegacyModlogConfigOnce();

    const dir = guildDir(guildId);
    const configPath = guildModlogConfigPath(guildId);

    const stat = await fsp.stat(configPath).catch(() => null);
    if (!stat) {
      await ensureDir(dir, `guild data folder (${guildId})`);

      const initial = JSON.stringify({
        channelId: null,
        trapChannelId: null,
        trapExemptRoleIds: [],
        trapBanCount: 0,
      }, null, 2);
      await fsp.writeFile(configPath, initial, 'utf8');
      debugCreated(`modlog config file for guild ${guildId}`, configPath);

      const data = {
        channelId: null,
        trapChannelId: null,
        trapExemptRoleIds: [],
        trapBanCount: 0,
      };
      modlogConfigCacheByGuild.set(String(guildId), { data, mtimeMs: -1 });
      return data;
    }

    const key = String(guildId);
    const cached = modlogConfigCacheByGuild.get(key);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;

    const raw = await fsp.readFile(configPath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};

    const normalized =
        parsed && typeof parsed === 'object'
            ? {
              channelId: parsed.channelId ?? null,
              trapChannelId: parsed.trapChannelId ?? null,
              trapExemptRoleIds: Array.isArray(parsed.trapExemptRoleIds) ? parsed.trapExemptRoleIds : [],
              trapBanCount: Number.isInteger(parsed.trapBanCount) ? parsed.trapBanCount : 0,
            }
            : { channelId: null };

    modlogConfigCacheByGuild.set(key, { data: normalized, mtimeMs: stat.mtimeMs });
    return normalized;
  } catch (err) {
    console.error('Failed to load guild modlog config:', err);
    return {};
  }
}

async function getModlogChannelFromMessage(message) {
  const guild = message?.guild;
  if (!guild) return null;

  const config = await loadGuildModlogConfig(guild.id);
  const channelId = config?.channelId;
  if (!channelId) return null;

  return guild.channels.cache.get(channelId) ?? null;
}

async function getModlogChannelFromGuild(guild) {
  if (!guild) return null;

  const config = await loadGuildModlogConfig(guild.id);
  const channelId = config?.channelId;
  if (!channelId) return null;

  return guild.channels.cache.get(channelId) ?? null;
}

function baseEmbed({ color, title, actor }) {
  const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setTimestamp();

  const name = safeTag(actor);
  const iconURL = safeAvatarURL(actor);
  if (iconURL) embed.setAuthor({ name, iconURL });
  else embed.setAuthor({ name });

  return embed;
}

function relativeTimeField() {
  return { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true };
}

function truncateField(value, maxLength = 1024) {
  let text;

  if (typeof value === 'string') {
    text = value;
  } else if (value == null) {
    text = '';
  } else {
    text = String(value);
  }

  if (!text.length) text = '*No content*';
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}...`;
}

function channelTypeLabel(channel) {
  if (!channel) return 'Unknown';

  const typeMap = {
    0: 'Text Channel',
    2: 'Voice Channel',
    4: 'Category',
    5: 'Announcement Channel',
    13: 'Stage Channel',
    15: 'Forum Channel',
    16: 'Media Channel',
  };

  return typeMap[channel.type] ?? `Unknown (${channel.type})`;
}

function channelMention(channel) {
  return channel?.id ? `<#${channel.id}>` : 'Unknown';
}

function messageJumpLink(message) {
  if (!message?.guild?.id || !message?.channel?.id || !message?.id) return 'Unavailable';
  return `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
}

function userDisplay(userLike) {
  const user = userLike?.user ?? userLike;
  const tag = safeTag(userLike);
  const id = userLike?.id ?? user?.id ?? 'Unknown';
  return `${tag} (${id})`;
}

function avatarUrlForUser(userLike) {
  try {
    const user = userLike?.user ?? userLike;
    return user?.displayAvatarURL?.({ size: 1024 }) ?? null;
  } catch {
    return null;
  }
}

function guildAvatarUrlForMember(member) {
  try {
    return member?.displayAvatarURL?.({ size: 1024 }) ?? null;
  } catch {
    return null;
  }
}

function rolePermissionsText(role) {
  try {
    const permissions = role?.permissions instanceof PermissionsBitField
        ? role.permissions.toArray()
        : new PermissionsBitField(role?.permissions?.bitfield ?? role?.permissions ?? 0n).toArray();

    if (!permissions.length) return 'No permissions';
    return permissions.join(', ');
  } catch {
    return 'Unable to read permissions';
  }
}

function roleDisplay(role) {
  if (!role?.id) return 'Unknown';
  return `<@&${role.id}>`;
}

async function getRecentAuditLogExecutor(guild, type, targetId) {
  try {
    if (!guild || !type || !targetId) return guild?.client?.user ?? null;

    const logs = await guild.fetchAuditLogs({
      type,
      limit: 6,
    });

    const entry = logs.entries.find(auditEntry => {
      const isTarget = auditEntry.target?.id === targetId;
      const isRecent = Date.now() - auditEntry.createdTimestamp < 15 * 1000;
      return isTarget && isRecent;
    });

    return entry?.executor ?? guild.client.user;
  } catch {
    return guild?.client?.user ?? null;
  }
}

async function safeSend(channel, payload) {
  if (!channel) return;
  try {
    await channel.send(payload);
  } catch (err) {
    console.error('Failed to send modlog message:', err);
  }
}

function formatAttachmentLinks(message) {
  const attachments = message?.attachments;
  if (!attachments || !attachments.size) return null;

  return [...attachments.values()]
      .map(att => `[${att.name ?? 'attachment'}](${att.url})`)
      .join('\n');
}

function firstImageAttachmentUrl(message) {
  const attachments = message?.attachments;
  if (!attachments || !attachments.size) return null;

  const image = [...attachments.values()].find(att =>
      att.contentType?.startsWith('image/') ?? /\.(png|jpe?g|gif|webp)$/i.test(att.name ?? '')
  );

  return image?.url ?? null;
}

async function logMessageDeletion(_client, message, author) {
  const modlogChannel = await getModlogChannelFromMessage(message);
  if (!modlogChannel) return;

  const hasAttachments = message?.attachments?.size > 0;
  let content;
  if (message?.content?.length) {
    content = message.content;
  } else if (hasAttachments) {
    content = '*No text content (attachment only)*';
  } else if (message?.partial) {
    content = '*Content unavailable — message was not cached before deletion*';
  } else {
    content = '*No content*';
  }

  const attachmentLinks = formatAttachmentLinks(message);
  const imageUrl = firstImageAttachmentUrl(message);

  const embed = baseEmbed({
    color: '#fc6603',
    title: 'Message Deleted',
    actor: message?.author,
  })
      .setDescription(`**Message:**\n${content}`)
      .addFields(
          { name: 'Author', value: userDisplay(message?.author), inline: true },
          { name: 'Deleted By', value: safeTag(author), inline: true },
          { name: 'Channel', value: channelMention(message?.channel), inline: true },
          { name: 'Message ID', value: message?.id ?? 'Unknown', inline: true },
          ...(attachmentLinks ? [{ name: 'Attachments', value: truncateField(attachmentLinks), inline: false }] : []),
          relativeTimeField()
      );

  if (imageUrl) embed.setImage(imageUrl);

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logMessageEdit(_client, oldMessage, newMessage) {
  const message = newMessage ?? oldMessage;
  const modlogChannel = await getModlogChannelFromMessage(message);
  if (!modlogChannel) return;

  if (oldMessage?.author?.bot || newMessage?.author?.bot) return;

  const oldContentRaw = oldMessage?.content;
  const newContentRaw = newMessage?.content;

  if (typeof oldContentRaw !== 'string' || typeof newContentRaw !== 'string') return;
  if (!oldContentRaw.length && !newContentRaw.length) return;
  if (oldContentRaw === newContentRaw) return;

  const oldContent = oldContentRaw.length ? oldContentRaw : '*No previous content available*';
  const newContent = newContentRaw.length ? newContentRaw : '*No new content available*';

  const attachmentLinks = formatAttachmentLinks(newMessage ?? oldMessage);

  const embed = baseEmbed({
    color: '#3498db',
    title: 'Message Edited',
    actor: message?.author,
  })
      .addFields(
          { name: 'Author', value: userDisplay(message?.author), inline: true },
          { name: 'Channel', value: channelMention(message?.channel), inline: true },
          { name: 'Message ID', value: message?.id ?? 'Unknown', inline: true },
          { name: 'Jump Link', value: messageJumpLink(message), inline: false },
          relativeTimeField(),
          { name: 'Before', value: truncateField(oldContent), inline: false },
          { name: 'After', value: truncateField(newContent), inline: false },
          ...(attachmentLinks ? [{ name: 'Attachments', value: truncateField(attachmentLinks), inline: false }] : [])
      );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logMemberJoin(_client, member) {
  const modlogChannel = await getModlogChannelFromGuild(member?.guild);
  if (!modlogChannel) return;

  const userTag = member?.user?.tag ?? 'Unknown';
  const userId = member?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#43b581',
    title: 'Member Joined',
    actor: member?.user,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Account Created', value: member?.user?.createdTimestamp ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logMemberLeave(_client, member) {
  const modlogChannel = await getModlogChannelFromGuild(member?.guild);
  if (!modlogChannel) return;

  const userTag = member?.user?.tag ?? 'Unknown';
  const userId = member?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#ff5555',
    title: 'Member Left',
    actor: member?.user,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logChannelCreate(_client, channel) {
  const modlogChannel = await getModlogChannelFromGuild(channel?.guild);
  if (!modlogChannel) return;

  const embed = baseEmbed({
    color: '#43b581',
    title: 'Channel Created',
    actor: channel?.client?.user,
  }).addFields(
      { name: 'Channel', value: channelMention(channel), inline: true },
      { name: 'Type', value: channelTypeLabel(channel), inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logChannelDelete(_client, channel) {
  const modlogChannel = await getModlogChannelFromGuild(channel?.guild);
  if (!modlogChannel) return;

  const embed = baseEmbed({
    color: '#ff5555',
    title: 'Channel Deleted',
    actor: channel?.client?.user,
  }).addFields(
      { name: 'Channel', value: `${channel?.name ?? 'Unknown'} (${channel?.id ?? 'Unknown'})`, inline: true },
      { name: 'Type', value: channelTypeLabel(channel), inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logRoleCreate(_client, role) {
  const modlogChannel = await getModlogChannelFromGuild(role?.guild);
  if (!modlogChannel) return;

  const executor = await getRecentAuditLogExecutor(
      role?.guild,
      AuditLogEvent.RoleCreate,
      role?.id
  );

  const embed = baseEmbed({
    color: '#43b581',
    title: 'Role Created',
    actor: role?.client?.user,
  }).addFields(
      { name: 'Role', value: roleDisplay(role), inline: true },
      { name: 'Created By', value: safeTag(executor), inline: true },
      relativeTimeField(),
      { name: 'Permissions', value: truncateField(rolePermissionsText(role)), inline: false }
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logRoleUpdate(_client, oldRole, newRole) {
  const modlogChannel = await getModlogChannelFromGuild(newRole?.guild ?? oldRole?.guild);
  if (!modlogChannel) return;

  const oldPerms = rolePermissionsText(oldRole);
  const newPerms = rolePermissionsText(newRole);

  const oldPermArray = oldRole?.permissions?.toArray?.() ?? [];
  const newPermArray = newRole?.permissions?.toArray?.() ?? [];

  const addedPerms = newPermArray.filter(permission => !oldPermArray.includes(permission));
  const removedPerms = oldPermArray.filter(permission => !newPermArray.includes(permission));

  const changedFields = [];

  if (oldRole?.name !== newRole?.name) {
    changedFields.push({
      name: 'Name Changed',
      value: `${oldRole?.name ?? 'Unknown'} → ${newRole?.name ?? 'Unknown'}`,
      inline: false,
    });
  }

  if (oldRole?.hexColor !== newRole?.hexColor) {
    changedFields.push({
      name: 'Color Changed',
      value: `${oldRole?.hexColor ?? 'Unknown'} → ${newRole?.hexColor ?? 'Unknown'}`,
      inline: false,
    });
  }

  if (oldPerms !== newPerms) {
    changedFields.push(
        {
          name: 'Permissions Added',
          value: truncateField(addedPerms.length ? addedPerms.join(', ') : 'None'),
          inline: false,
        },
        {
          name: 'Permissions Removed',
          value: truncateField(removedPerms.length ? removedPerms.join(', ') : 'None'),
          inline: false,
        }
    );
  }

  if (!changedFields.length) return;

  const embed = baseEmbed({
    color: '#f1c40f',
    title: 'Role Updated',
    actor: newRole?.client?.user,
  }).addFields(
      { name: 'Role', value: roleDisplay(newRole), inline: true },
      { name: 'Updated By', value: roleDisplay(exectutor), inline: true },
      relativeTimeField(),
      ...changedFields
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logMemberRoleUpdate(_client, oldMember, newMember) {
  const modlogChannel = await getModlogChannelFromGuild(newMember?.guild ?? oldMember?.guild);
  if (!modlogChannel) return;

  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return;

  const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
  const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

  if (!addedRoles.size && !removedRoles.size) return;

  const memberTag = newMember?.user?.tag ?? oldMember?.user?.tag ?? 'Unknown';
  const memberId = newMember?.id ?? oldMember?.id ?? 'Unknown';

  const fields = [
    { name: 'User', value: `${memberTag} (${memberId})`, inline: true },
    relativeTimeField(),
  ];

  if (addedRoles.size) {
    fields.push({
      name: 'Roles Added',
      value: truncateField(addedRoles.map(role => roleDisplay(role)).join('\n')),
      inline: false,
    });
  }

  if (removedRoles.size) {
    fields.push({
      name: 'Roles Removed',
      value: truncateField(removedRoles.map(role => roleDisplay(role)).join('\n')),
      inline: false,
    });
  }

  const embed = baseEmbed({
    color: addedRoles.size ? '#43b581' : '#ff5555',
    title: 'Member Roles Updated',
    actor: newMember?.user ?? oldMember?.user,
  }).addFields(...fields);

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logMemberProfileUpdate(_client, oldMember, newMember) {
  const modlogChannel = await getModlogChannelFromGuild(newMember?.guild ?? oldMember?.guild);
  if (!modlogChannel) return;

  const changedFields = [];
  const oldNickname = oldMember?.nickname ?? oldMember?.user?.username ?? 'None';
  const newNickname = newMember?.nickname ?? newMember?.user?.username ?? 'None';

  if (oldMember?.nickname !== newMember?.nickname) {
    changedFields.push({
      name: 'Nickname Changed',
      value: `${oldNickname} → ${newNickname}`,
      inline: false,
    });
  }

  const oldGuildAvatar = guildAvatarUrlForMember(oldMember);
  const newGuildAvatar = guildAvatarUrlForMember(newMember);

  if (oldGuildAvatar !== newGuildAvatar) {
    changedFields.push({
      name: 'Server Avatar Changed',
      value: [
        oldGuildAvatar ? `[Old Avatar](${oldGuildAvatar})` : 'Old Avatar: None',
        newGuildAvatar ? `[New Avatar](${newGuildAvatar})` : 'New Avatar: None',
      ].join('\n'),
      inline: false,
    });
  }

  if (!changedFields.length) return;

  const embed = baseEmbed({
    color: '#9b59b6',
    title: 'Member Profile Updated',
    actor: newMember?.user ?? oldMember?.user,
  }).addFields(
      { name: 'User', value: userDisplay(newMember ?? oldMember), inline: true },
      relativeTimeField(),
      ...changedFields
  );

  if (newGuildAvatar) embed.setThumbnail(newGuildAvatar);

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logUserProfileUpdate(client, oldUser, newUser) {
  if (!client?.guilds?.cache?.size) return;

  const changedFields = [];

  if (oldUser?.username !== newUser?.username) {
    changedFields.push({
      name: 'Username Changed',
      value: `${oldUser?.username ?? 'Unknown'} → ${newUser?.username ?? 'Unknown'}`,
      inline: false,
    });
  }

  const oldGlobalName = oldUser?.globalName ?? null;
  const newGlobalName = newUser?.globalName ?? null;

  if (oldGlobalName !== newGlobalName) {
    changedFields.push({
      name: 'Global Display Name Changed',
      value: `${oldGlobalName ?? 'None'} → ${newGlobalName ?? 'None'}`,
      inline: false,
    });
  }

  const oldAvatar = avatarUrlForUser(oldUser);
  const newAvatar = avatarUrlForUser(newUser);

  if (oldAvatar !== newAvatar) {
    changedFields.push({
      name: 'Global Avatar Changed',
      value: [
        oldAvatar ? `[Old Avatar](${oldAvatar})` : 'Old Avatar: None',
        newAvatar ? `[New Avatar](${newAvatar})` : 'New Avatar: None',
      ].join('\n'),
      inline: false,
    });
  }

  if (!changedFields.length) return;

  for (const guild of client.guilds.cache.values()) {
    const member = guild.members.cache.get(newUser.id);
    if (!member) continue;

    const modlogChannel = await getModlogChannelFromGuild(guild);
    if (!modlogChannel) continue;

    const embed = baseEmbed({
      color: '#9b59b6',
      title: 'User Profile Updated',
      actor: newUser,
    }).addFields(
        { name: 'User', value: userDisplay(newUser), inline: true },
        relativeTimeField(),
        ...changedFields
    );

    if (newAvatar) embed.setThumbnail(newAvatar);

    await safeSend(modlogChannel, { embeds: [embed] });
  }
}

async function logSnipeClear(_client, message, author) {
  const modlogChannel = await getModlogChannelFromMessage(message);
  if (!modlogChannel) return;

  const embed = baseEmbed({
    color: '#a903fc',
    title: 'Snipe Cleared',
    actor: author,
  })
      .setDescription('Snipe data has been cleared.')
      .addFields(
          { name: 'Cleared By', value: safeTag(author), inline: true },
          { name: 'Channel', value: channelMention(message?.channel), inline: true },
          { name: 'Message ID', value: message?.id ?? 'Unknown', inline: true },
          relativeTimeField()
      );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logBan(_client, guild, target, moderator, reason = 'No reason specified') {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = target?.user?.tag ?? target?.tag ?? 'Unknown';
  const userId = target?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#ff0000',
    title: 'User Banned',
    actor: moderator,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Banned By', value: safeTag(moderator), inline: true },
      { name: 'Reason', value: reason, inline: false },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logUnban(_client, guild, user, author) {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = user?.tag ?? 'Unknown';
  const userId = user?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#00ff00',
    title: 'User Unbanned',
    actor: author,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Unbanned By', value: safeTag(author), inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logKick(_client, guild, user, author, reason = 'No reason specified') {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = user?.tag ?? 'Unknown';
  const userId = user?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#ffa500',
    title: 'User Kicked',
    actor: author,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Kicked By', value: safeTag(author), inline: true },
      { name: 'Reason', value: reason, inline: false },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logClearMessages(_client, message, author, amount, messagesContent) {
  try {
    await ensureDir(CLEARED_DIR, 'cleared messages folder');

    const guildId = message?.guild?.id ?? 'unknown_guild';
    const channelId = message?.channel?.id ?? 'unknown_channel';
    const stamp = Date.now();
    const fileName = `cleared_${guildId}_${channelId}_${stamp}.txt`;
    const filePath = path.join(CLEARED_DIR, fileName);

    const toWrite = `${messagesContent ?? ''}\n`;
    await fsp.writeFile(filePath, toWrite, 'utf8');

    const modlogChannel = await getModlogChannelFromMessage(message);
    if (!modlogChannel) return;

    const channelName = message?.channel?.name ?? 'Unknown';

    const embed = baseEmbed({
      color: '#03fcb6',
      title: 'Messages Cleared',
      actor: author,
    })
        .setDescription(
            `**Actioned By:** ${safeTag(author)}\n**Channel:** ${channelName}\nCleared messages have been saved to a file.`
        )
        .addFields(
            { name: 'Amount Cleared', value: `${amount ?? 0}`, inline: true },
            { name: 'Cleared By', value: safeTag(author), inline: true },
            relativeTimeField()
        );

    await safeSend(modlogChannel, {
      embeds: [embed],
      files: [filePath],
    });

    fsp.unlink(filePath).catch(() => null);
  } catch (err) {
    console.error('Failed during clear-messages logging:', err);
  }
}

async function logTimeout(_client, guild, user, author, reason = 'No reason specified', duration = 'Unknown') {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = user?.tag ?? 'Unknown';
  const userId = user?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#ffa500',
    title: 'Time Out',
    actor: author,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Timed Out By', value: safeTag(author), inline: true },
      { name: 'Duration', value: `${duration}`, inline: true },
      { name: 'Reason', value: reason, inline: false },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logUntimeout(_client, guild, user, author, reason = 'No reason specified') {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = user?.tag ?? 'Unknown';
  const userId = user?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#43b581',
    title: 'User Untimed Out',
    actor: author,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Untimed Out By', value: safeTag(author), inline: true },
      { name: 'Reason', value: reason, inline: false },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logWarn(_client, guild, user, author, reason = 'No reason specified', warnCount = null) {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = user?.tag ?? 'Unknown';
  const userId = user?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#ffcc00',
    title: 'User Warned',
    actor: author,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Warned By', value: safeTag(author), inline: true },
      { name: 'Reason', value: reason, inline: false },
      ...(warnCount != null ? [{ name: 'Total Warnings', value: String(warnCount), inline: true }] : []),
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logUnwarn(_client, guild, user, author, removedCount = 1, newCount = null, note = null, removedMode = null) {
  const modlogChannel = await getModlogChannelFromGuild(guild);
  if (!modlogChannel) return;

  const userTag = user?.tag ?? 'Unknown';
  const userId = user?.id ?? 'Unknown';

  const embed = baseEmbed({
    color: '#43b581',
    title: 'Warning Removed',
    actor: author,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Removed By', value: safeTag(author), inline: true },
      { name: 'Warnings Removed', value: String(removedCount ?? 0), inline: true },
      ...(newCount != null ? [{ name: 'Total Warnings Now', value: String(newCount), inline: true }] : []),
      ...(removedMode ? [{ name: 'Removal Mode', value: String(removedMode), inline: true }] : []),
      ...(note ? [{ name: 'Note', value: String(note).slice(0, 1024), inline: false }] : []),
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logJail(_client, guild, target, moderator, duration = null) {
  const modlogChannel = await getModlogChannelFromGuild(guild);

  const userTag = target?.user?.tag ?? target?.tag ?? 'Unknown';
  const userId = target?.id ?? 'Unknown';
  const durationText = duration ?? 'Indefinite';

  const embed = baseEmbed({
    color: '#ff4444',
    title: 'User Jailed',
    actor: moderator,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Jailed By', value: safeTag(moderator), inline: true },
      { name: 'Duration', value: durationText, inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });

  try {
    const dmEmbed = new EmbedBuilder()
        .setColor('#ff4444')
        .setTitle(`You have been jailed in ${guild.name}`)
        .addFields(
            { name: 'Duration', value: durationText, inline: true },
            { name: 'Jailed By', value: safeTag(moderator), inline: true },
            relativeTimeField()
        )
        .setTimestamp();

    const user = target?.user ?? target;
    await user?.send({ embeds: [dmEmbed] });
  } catch {
    // DMs disabled, silently ignore
  }
}

async function logUnjail(_client, guild, target, moderator, expired = false) {
  const modlogChannel = await getModlogChannelFromGuild(guild);

  const userTag = target?.user?.tag ?? target?.tag ?? 'Unknown';
  const userId = target?.id ?? 'Unknown';
  const reason = expired ? 'Sentence expired' : `Unjailed by ${safeTag(moderator)}`;

  const embed = baseEmbed({
    color: '#43b581',
    title: 'User Unjailed',
    actor: moderator,
  }).addFields(
      { name: 'User', value: `${userTag} (${userId})`, inline: true },
      { name: 'Reason', value: reason, inline: true },
      relativeTimeField()
  );

  await safeSend(modlogChannel, { embeds: [embed] });

  try {
    const dmEmbed = new EmbedBuilder()
        .setColor('#43b581')
        .setTitle(`You have been unjailed in ${guild.name}`)
        .addFields(
            { name: 'Reason', value: reason, inline: true },
            relativeTimeField()
        )
        .setTimestamp();

    const user = target?.user ?? target;
    await user?.send({ embeds: [dmEmbed] });
  } catch {
    // DMs disabled, silently ignore (so bot doesn't fucking crash)
  }
}

module.exports = {
  logMessageDeletion,
  logMessageEdit,
  logSnipeClear,
  logUnban,
  logBan,
  logKick,
  logClearMessages,
  logTimeout,
  logUntimeout,
  logWarn,
  logUnwarn,
  logJail,
  logUnjail,
  logMemberJoin,
  logMemberLeave,
  logChannelCreate,
  logChannelDelete,
  logRoleCreate,
  logRoleUpdate,
  logMemberRoleUpdate,
  logMemberProfileUpdate,
  logUserProfileUpdate,
};

// shit says 1022 lines
// someone please remind me to separate these functions later