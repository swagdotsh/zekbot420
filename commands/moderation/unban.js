const { PermissionFlagsBits } = require('discord.js');
const { logUnban } = require('../../log');

module.exports = {
  name: 'unban',
  aliases: ['deban'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;

    const identifier = args[0];
    if (!identifier) return message.reply('Provide a user ID or tag to unban.');

    try {
      const bans = await message.guild.bans.fetch();
      const target = bans.find(ban => 
        ban.user.id === identifier || 
        ban.user.tag.toLowerCase() === identifier.toLowerCase()
      );

      if (!target) return message.reply('User not found in ban list.');

      await message.guild.members.unban(target.user.id);
      message.reply(`👍`);

      await logUnban(message.client, message.guild, target.user, message.author);
    } catch (err) {
      console.error(err);
      message.reply('Failed to unban the user.');
    }
  }
};
