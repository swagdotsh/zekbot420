const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, InteractionContextType } = require('discord.js');
const { setStickyRolesEnabled, getStickyRolesEnabled, getStickyRoles } = require('../../../stickyrolesDbHndlr');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stickyroles')
        .setDescription('Enable or disable sticky roles for your server')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((opt) =>
            opt
                .setName('action')
                .setDescription('Enable or disable sticky roles')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'on' },
                    { name: 'Disable', value: 'off' },
                    { name: 'View Status', value: 'status' }
                )
        ),

    async execute(interaction) {
        const action = interaction.options.getString('action');

        try {
            if (action === 'status') {
                const enabled = await getStickyRolesEnabled(interaction.guild.id);
                const sticky = await getStickyRoles(interaction.guild.id);
                const roles = sticky.map(r => `<@&${r.role_id}>`).join(', ') || 'None set';

                const embed = new EmbedBuilder()
                    .setColor('#5865f2')
                    .setTitle('🎯 Sticky Roles Configuration')
                    .addFields(
                        { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Sticky Roles', value: roles, inline: false }
                    );

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const enabling = action === 'on';
            await setStickyRolesEnabled(interaction.guild.id, enabling);

            const embed = new EmbedBuilder()
                .setColor(enabling ? '#00ff88' : '#ff0000')
                .setTitle(enabling ? '✅ Sticky Roles Enabled' : '❌ Sticky Roles Disabled')
                .setDescription(enabling
                    ? 'Users who rejoin will now get their sticky roles back (unless banned).'
                    : 'Sticky roles are now disabled.'
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: 'Something went wrong updating the configuration.',
                ephemeral: true
            });
        }
    }
};

