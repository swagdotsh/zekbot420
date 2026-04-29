const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logBan } = require('../../log');

module.exports = {
  name: 'ban',
  aliases: ['byebye'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;

    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to ban.');
    if (!target.bannable) return message.reply('I can’t ban that user.');

    const reason = args.slice(1).join(' ') || 'No reason specified';

    try {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Ban')
        .setDescription(`You’ve been banned from **${message.guild.name}**.`)
        .addFields(
          { name: 'Banned By', value: message.author.tag, inline: true },
          { name: 'Banned At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: "Server ID: "+message.guild.id })
        .setTimestamp();

      await target.send({ embeds: [embed] });
    } catch (err) {
      console.error('Error sending DM to user:', err);
    }

    await target.ban({ reason });

    await logBan(message.client, message.guild, target, message.author, reason);
    message.reply(`✌️ ${target.user.tag} has been banned.`);
  }
};
