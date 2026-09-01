const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getStickyRolesEnabled, addUserStickyRole, removeUserStickyRole, getUserStickyRoles } = require('../../../stickyrolesDbHndlr');

module.exports = {
  name: 'userstickyroles',
  aliases: ['usersticky'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('You need the **Manage Server** permission to run this. <:smirk2:1498272372539785286>');
    }

    const action = args[0]?.toLowerCase();
    const userArg = args[1];
    const roleArg = args[2];

    if (!action || !userArg || !roleArg) {
      return message.reply('Usage: `,userstickyroles add <@user> <@role>` or `,userstickyroles remove <@user> <@role>`');
    }

    // Parse user
    let user = message.mentions.members.first() || message.guild.members.cache.get(userArg);
    if (!user) {
      try {
        user = await message.guild.members.fetch(userArg);
      } catch {
        return message.reply('User not found.');
      }
    }

    // Parse role
    let role = message.mentions.roles.first();
    if (!role) {
      role = message.guild.roles.cache.get(roleArg);
    }
    if (!role) {
      role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleArg.toLowerCase());
    }
    if (!role) {
      return message.reply('Role not found.');
    }

    try {
      if (action === 'add') {
        await addUserStickyRole(message.guild.id, user.id, role.id);
        const embed = new EmbedBuilder()
          .setColor('#00ff88')
          .setTitle('✅ Sticky Role Added to User')
          .setDescription(`${user} will now keep ${role} if they rejoin.`);
        return message.reply({ embeds: [embed] });
      } else if (action === 'remove') {
        await removeUserStickyRole(message.guild.id, user.id, role.id);
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('✅ Sticky Role Removed from User')
          .setDescription(`${user} will no longer keep ${role} if they rejoin.`);
        return message.reply({ embeds: [embed] });
      } else {
        return message.reply('Invalid action. Use `add` or `remove`.');
      }
    } catch (err) {
      console.error(err);
      message.reply('Something went wrong updating user sticky roles.');
    }
  }
};
