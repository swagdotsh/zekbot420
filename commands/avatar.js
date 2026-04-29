const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  execute(message, args) {
    const user = message.mentions.users.first() || message.author;

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Avatar`)
      .setImage(user.displayAvatarURL({ extension: 'png', dynamic: true, size: 512 }))
      .setColor('#3498db')
      .setFooter({ text: "Requested by "+message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};
