const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'welcomesetup',
  aliases: ['ws'],
  async execute(message, args) {
    if (!message.member.permissions.has('Administrator')) return message.reply('You need Administrator permissions. <:smirk2:1498272372539785286>');

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('Usage: ,welcomesetup #channel');

    const guildDir = path.join(__dirname, '../data', message.guild.id);
    const configPath = path.join(guildDir, 'welcomeConfig.json');

    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.channelId) {
          return message.reply(`Welcome messages are already configured in <#${config.channelId}>. Use \`,welcomesetup #channel\` after removing the saved configuration if you need to change it. <:smirk2:1498272372539785286>`);
        }
      }

      fs.mkdirSync(guildDir, { recursive: true });
      console.log('[welcomesetup] saving to:', configPath);
      fs.writeFileSync(configPath, JSON.stringify({ channelId: channel.id }, null, 2));
      message.reply(`Welcome channel set to ${channel}.`);
    } catch (err) {
      console.error('[welcomesetup]', err);
      message.reply('Failed to save config: ' + err.message);
    }
  }
};
