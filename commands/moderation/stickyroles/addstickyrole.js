const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getStickyRolesEnabled, addStickyRole } = require('../../../stickyrolesDbHndlr');

module.exports = {
  name: 'addstickyrole',
  aliases: ['addsticky', 'stickyroleon', 'asr', 'sr', 'stick', 'sticky'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('You need the **Manage Server** permission to run this.');
    }

    const roleArg = args[0];
    if (!roleArg) {
      return message.reply('Please specify a role. Usage: `,addstickyrole @role` or `,addstickyrole role_id`');
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
      return message.reply('Role not found. Usage: `,addstickyrole @role` or `,addstickyrole role_id`');
    }

    try {
      await addStickyRole(message.guild.id, role.id);

      const embed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle('✅ Sticky Role Added')
        .setDescription(`${role} is now a sticky role.\n\n**Note:** Sticky roles must be enabled using \`,stickyroles on\` to take effect.`);

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply('Something went wrong adding the sticky role.');
    }
  }
};

