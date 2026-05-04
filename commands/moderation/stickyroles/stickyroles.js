const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { setStickyRolesEnabled, getStickyRolesEnabled, getStickyRoles } = require('../../../stickyrolesDbHndlr');

module.exports = {
  name: 'stickyroles',
  aliases: ['stickyrolesconfig'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('You need the **Manage Server** permission to run this.');
    }

    const action = args[0]?.toLowerCase();

    if (action !== 'on' && action !== 'off') {
      const enabled = await getStickyRolesEnabled(message.guild.id);
      const sticky = await getStickyRoles(message.guild.id);
      const roles = sticky.map(r => `<@&${r.role_id}>`).join(', ') || 'None set';

      const embed = new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('🎯 Sticky Roles Configuration')
        .addFields(
          { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Sticky Roles', value: roles, inline: false }
        );

      return message.reply({ embeds: [embed] });
    }

    const enabling = action === 'on';

    try {
      await setStickyRolesEnabled(message.guild.id, enabling);

      const embed = new EmbedBuilder()
        .setColor(enabling ? '#00ff88' : '#ff0000')
        .setTitle(enabling ? '✅ Sticky Roles Enabled' : '❌ Sticky Roles Disabled')
        .setDescription(enabling
          ? 'Users who rejoin will now get their sticky roles back (unless banned).'
          : 'Sticky roles are now disabled.'
        );

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply('Something went wrong updating the configuration.');
    }
  }
};

