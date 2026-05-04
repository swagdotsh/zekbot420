const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(process.cwd(), 'data');

function guildDir(guildId) {
  return path.join(dataDir, String(guildId));
}

function guildConfigPath(guildId) {
  return path.join(guildDir(guildId), 'modlog.json');
}

function normalizeName(s) {
  return (s ?? '').toString().replace(/\s+/g, '').toLowerCase();
}

function extractChannelId(input) {
  const raw = (input ?? '').toString().trim();
  if (!raw) return null;

  const mentionMatch = raw.match(/^<#(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];

  const idMatch = raw.match(/^\d+$/);
  if (idMatch) return raw;

  return null;
}

async function readGuildConfig(guildId) {
  const cfgPath = guildConfigPath(guildId);
  try {
    if (!fs.existsSync(cfgPath)) return { channelId: null };
    const txt = await fs.promises.readFile(cfgPath, 'utf8');
    if (!txt.trim()) return { channelId: null };
    const parsed = JSON.parse(txt);
    return {
      channelId: parsed?.channelId ?? null,
    };
  } catch {
      return { channelId: null };
  }
}

async function writeGuildConfig(guildId, config) {
  const dir = guildDir(guildId);
  const cfgPath = guildConfigPath(guildId);

  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(cfgPath, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = {
  name: 'modlog',
  aliases: ['log'],
  async execute(message, args) {
    if (!message.member.permissions.has('Administrator') && message.author.id !== message.guild.ownerId) {
      return message.reply({ content: 'You do not have the required permissions to run this command.' });
    }

    const input = (args[0] ?? '').trim();
    if (!input) {
      return message.reply({
        content:
          'Please provide a channel (#channel, channel ID, or channel name).\n' +
          'Example: `,modlog #mod-logs`\n' +
          'To disable: `,modlog off`',
      });
    }

    const guildId = message.guild.id;

    if (['off', 'disable', 'none', 'clear', 'reset'].includes(input.toLowerCase())) {
      const config = await readGuildConfig(guildId);
      config.channelId = null;
      await writeGuildConfig(guildId, config);
      return message.reply({ content: 'Modlog has been disabled for this server.' });
    }

    const channelId = extractChannelId(input);
    let channel = null;

    if (channelId) {
      channel = message.guild.channels.cache.get(channelId) ?? null;
    }

    if (!channel) {
      const target = normalizeName(input);
      channel = message.guild.channels.cache.find((ch) => normalizeName(ch.name) === target) ?? null;
    }

    if (!channel) {
      return message.reply({ content: 'Could not find that channel. Please check the name/ID.' });
    }

    if (!channel.isTextBased?.() || channel.isDMBased?.()) {
      return message.reply({ content: 'Please choose a server text channel (not a category/voice/DM).' });
    }

    const config = await readGuildConfig(guildId);
    config.channelId = channel.id;
    await writeGuildConfig(guildId, config);

    return message.reply({ content: `Modlog channel has been set to ${channel}.` });
  },
};
