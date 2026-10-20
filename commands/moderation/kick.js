const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logKick } = require('../../log');
const { canModerate } = require('../../hierarchy');

module.exports = {
  name: 'kick',
  aliases: ['boot'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;

    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to kick.');
    if (!target.kickable) return message.reply('I can’t kick that user.');
    if (!canModerate(message.member, target)) return message.reply("You can't kick someone with the same or higher role than you. <:smirk2:1498272372539785286>");

    const reason = args.slice(1).join(' ') || 'No reason specified';

    try {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Kick')
        .setDescription(`You’ve been kicked from **${message.guild.name}**.`)
        .addFields(
          { name: 'Mod', value: message.author.tag, inline: true },
          { name: 'Kicked on', value: "<t:"+Math.floor(Date.now() / 1000)+":R>", inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Server ID: ${message.guild.id}` })
        .setTimestamp();

      await target.send({ embeds: [embed] });
    } catch (err) {
      console.error('Error sending DM to user:', err);
    }

    await target.kick(reason);  // Kick the user
    message.reply(`✌️`);

    await logKick(message.client, message.guild, target.user, message.author, reason);
  }
};
