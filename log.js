const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEGACY_MODLOG_CONFIG_PATH = path.join(DATA_DIR, 'modlogConfig.json');
const CLEARED_DIR = path.join(DATA_DIR, 'cleared_messages');

const GUILD_CONFIG_FILE_NAME = 'modlog.json';

// Per-guild cache: guildId -> { data, mtimeMs }
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
  return userLike?.tag ?? 'Unknown';
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
  // Moves data/modlogConfig.json (mapping) into per-guild folders as data/<guildId>/modlog.json
  // Safe to call often; it only migrates if legacy exists.
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

    // Keep the legacy file around (non-destructive) so nothing breaks unexpectedly.
    console.info(
      `[debug ${nowStamp()}] legacy modlogConfig.json was detected and migrated to per-guild folders (legacy file kept): ${LEGACY_MODLOG_CONFIG_PATH}`
    );
  } catch (err) {
    console.error('Failed to migrate legacy modlog config:', err);
  }
}

function safeTag(userLike) {
  return userLike?.tag ?? 'Unknown';
}

function safeAvatarURL(userLike) {
  try {
    return userLike?.displayAvatarURL?.() ?? null;
  } catch {
    return null;
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
      // New behavior: create data/<guildId>/modlog.json
      await ensureDir(dir, `guild data folder (${guildId})`);

      const initial = JSON.stringify({ channelId: null }, null, 2);
      await fsp.writeFile(configPath, initial, 'utf8');
      debugCreated(`modlog config file for guild ${guildId}`, configPath);

      const data = { channelId: null };
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
        ? { channelId: parsed.channelId ?? null }
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

async function safeSend(channel, payload) {
  if (!channel) return;
  try {
    await channel.send(payload);
  } catch (err) {
    console.error('Failed to send modlog message:', err);
  }
}

async function logMessageDeletion(_client, message, author) {
  const modlogChannel = await getModlogChannelFromMessage(message);
  if (!modlogChannel) return;

  const content = message?.content?.length ? message.content : '*No content*';
  const channelName = message?.channel?.name ?? 'Unknown';

  const embed = baseEmbed({
    color: '#fc6603',
    title: 'Message Deleted',
    actor: message?.author,
  })
      .setDescription(`**Message:**\n${content}`)
      .addFields(
          { name: 'Author', value: safeTag(message?.author), inline: true },
          { name: 'Deleted By', value: safeTag(author), inline: true },
          { name: 'Channel', value: channelName, inline: true },
          relativeTimeField()
      );

  await safeSend(modlogChannel, { embeds: [embed] });
}

async function logSnipeClear(_client, message, author) {
  const modlogChannel = await getModlogChannelFromMessage(message);
  if (!modlogChannel) return;

  const channelName = message?.channel?.name ?? 'Unknown';

  const embed = baseEmbed({
    color: '#a903fc',
    title: 'Snipe Cleared',
    actor: author,
  })
      .setDescription('Snipe data has been cleared.')
      .addFields(
          { name: 'Cleared By', value: safeTag(author), inline: true },
          { name: 'Channel', value: channelName, inline: true },
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
  // Save cleared messages under /data, but use a unique temp file to avoid races.
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
    if (!modlogChannel) {
      // If we can't log it, still keep the file (better than deleting evidence).
      return;
    }

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

module.exports = {
  logMessageDeletion,
  logSnipeClear,
  logUnban,
  logBan,
  logKick,
  logClearMessages,
  logTimeout,
  logUntimeout,
  logWarn,
  logUnwarn,
};