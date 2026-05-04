const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { removeStickyRole, getStickyRoles } = require('../../../stickyrolesDbHndlr');

module.exports = {
  name: 'removestickyrole',
  aliases: ['removesticky', 'stickyroleoff', 'rmstickyrole', 'rmsr', 'rsr', 'unstick', 'unsticky'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('You need the **Manage Server** permission to run this.');
    }

    const roleArg = args[0];
    if (!roleArg) {
      return message.reply('Please specify a role. Usage: `,removestickyrole @role` or `,removestickyrole role_id`');
    }

    let role;

    // Try to find role by mention
    role = message.mentions.roles.first();

    // Try to find by role ID
    if (!role) {
      role = message.guild.roles.cache.get(roleArg);
    }

    // Try to find by name
    if (!role) {
      role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleArg.toLowerCase());
    }

    if (!role) {
      return message.reply('Role not found. Usage: `,removestickyrole @role` or `,removestickyrole role_id`');
    }

    try {
      // Check if role is actually sticky
      const stickyRoles = await getStickyRoles(message.guild.id);
      const isSticky = stickyRoles.some(r => r.role_id === role.id);

      if (!isSticky) {
        return message.reply(`${role} is not a sticky role.`);
      }

      await removeStickyRole(message.guild.id, role.id);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('✅ Sticky Role Removed')
        .setDescription(`${role} is no longer a sticky role.`);

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply('Something went wrong removing the sticky role.');
    }
  }
};

