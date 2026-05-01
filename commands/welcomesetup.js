const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../welcomeConfig.json');

module.exports = {
  name: 'welcomesetup',
  aliases: ['ws'],
  async execute(message, args) {
    if (!message.member.permissions.has('Administrator')) return;

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('Mention the channel to set for welcoming.');

    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    }

    config[message.guild.id] = channel.id;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    message.reply(`Welcome channel has been set to ${channel}.`);
  }
};
