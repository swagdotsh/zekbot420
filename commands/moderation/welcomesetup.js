const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('../../jsonStore');

module.exports = {
  name: 'welcomesetup',
  aliases: ['ws'],
  async execute(message, args) {
    if (!message.member.permissions.has('Administrator')) return message.reply('You need Administrator permissions. <:smirk2:1498272372539785286>');

    const channel = message.mentions.channels.find(c => c.guildId === message.guild.id);
    if (!channel) return message.reply(`Usage: \`${process.env.PREFIX}welcomesetup #channel\``);

    const guildDir = path.join(__dirname, '../../data', message.guild.id);
    const configPath = path.join(guildDir, 'welcomeConfig.json');

    try {
      fs.mkdirSync(guildDir, { recursive: true });
      await writeJsonAtomic(configPath, { channelId: channel.id });
      message.reply(`Welcome channel set to ${channel}.`);
    } catch (err) {
      console.error('[welcomesetup]', err);
      message.reply('Failed to save config: ' + err.message);
    }
  }
};
