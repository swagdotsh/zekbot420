const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { logMessageDeletion } = require('./log');

const SNIPE_TTL_MS = 60 * 60 * 1000;
const MAX_SNIPES_PER_CHANNEL = 20;
const AUDIT_LOG_DELAY_MS = 1500;

const seenDeleteCounts = new Map();

async function deletedByModerator(message) {
  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return false;

  await new Promise(resolve => setTimeout(resolve, AUDIT_LOG_DELAY_MS));

  const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 }).catch(() => null);
  if (!logs) return false;

  let match = false;
  for (const entry of logs.entries.values()) {
    const count = entry.extra?.count ?? 1;
    const previous = seenDeleteCounts.get(entry.id);
    seenDeleteCounts.set(entry.id, count);

    const isTarget = entry.target?.id === message.author.id && entry.extra?.channel?.id === message.channel.id;
    const isFresh = Date.now() - entry.createdTimestamp < 10 * 1000 || (previous !== undefined && count > previous);
    if (isTarget && isFresh) match = true;
  }

  if (seenDeleteCounts.size > 500) seenDeleteCounts.clear();
  return match;
}

function pruneExpired(map, getTimestamp) {
  const cutoff = Date.now() - SNIPE_TTL_MS;
  for (const [channelId, value] of map) {
    if (Array.isArray(value)) {
      const fresh = value.filter(item => getTimestamp(item) >= cutoff);
      if (fresh.length) map.set(channelId, fresh);
      else map.delete(channelId);
    } else if (getTimestamp(value) < cutoff) {
      map.delete(channelId);
    }
  }
}

module.exports = (client) => {
  if (!client.snipes) client.snipes = new Map();

  setInterval(() => {
    pruneExpired(client.snipes, snipe => snipe.timestamp);
    if (client.editSnipes) pruneExpired(client.editSnipes, snipe => snipe.timestamp);
  }, 5 * 60 * 1000).unref();

  client.on('messageDelete', async message => {
    try {
      if (!message.guild || message.author?.bot) return;

      if (message.partial || !message.author) {
        await logMessageDeletion(client, message, message.author);
        return;
      }

      const snipes = client.snipes.get(message.channel.id) || [];

      const attachments = message.attachments?.size
          ? [...message.attachments.values()].map(att => ({
            name: att.name ?? 'attachment',
            url: att.url,
            contentType: att.contentType ?? null,
          }))
          : [];

      const snipe = {
        content: message.content || (attachments.length ? '' : '[No content]'),
        attachments,
        user: message.author,
        timestamp: Date.now()
      };

      snipes.unshift(snipe);
      if (snipes.length > MAX_SNIPES_PER_CHANNEL) snipes.pop();
      client.snipes.set(message.channel.id, snipes);

      await logMessageDeletion(client, message, message.author);

      if (await deletedByModerator(message)) {
        const current = client.snipes.get(message.channel.id);
        const index = current?.indexOf(snipe) ?? -1;
        if (index !== -1) current.splice(index, 1);
        if (current && !current.length) client.snipes.delete(message.channel.id);
      }
    } catch (error) {
      console.error('Failed to handle message delete:', error);
    }
  });
};
