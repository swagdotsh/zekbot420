const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logUntimeout } = require('../../log');

module.exports = {
  name: 'untimeout',
  aliases: ['unmute', 'uto'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('You do not have permission to remove timeouts.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to untimeout.');

    if (target.id === message.author.id) {
      return message.reply("You can't untimeout yourself.");
    }

    if (!target.communicationDisabledUntil) {
      return message.reply(`**${target.user.tag}** is not currently timed out.`);
    }

    try {
      await target.timeout(null);
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Timeout Removed')
        .setDescription(`Your timeout has been removed in **${message.guild.name}**.`)
        .addFields(
          { name: 'Unmuted By', value: message.author.tag, inline: true },
          { name: 'Unmuted On', value: "<t:"+Math.floor(Date.now() / 1000)+":R>", inline: true }
        )
        .setFooter({ text: `Server ID: ${message.guild.id}` })
        .setTimestamp();

      await target.send({ embeds: [embed] });
      await logUntimeout(message.client, message.guild, target, message.author);
      message.reply(`👍`);
    } catch (err) {
      console.error(err);
      message.reply('There was an error removing the timeout.');
    }
  }
};