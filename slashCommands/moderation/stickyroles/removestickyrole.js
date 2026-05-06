const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, InteractionContextType } = require('discord.js');
const { removeStickyRole, getStickyRoles } = require('../../../stickyrolesDbHndlr');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removestickyrole')
        .setDescription('Remove a sticky role')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addRoleOption((opt) =>
            opt
                .setName('role')
                .setDescription('The role to remove from sticky roles')
                .setRequired(true)
        ),

    async execute(interaction) {
        const role = interaction.options.getRole('role');

        try {
            // Check if role is actually sticky
            const stickyRoles = await getStickyRoles(interaction.guild.id);
            const isSticky = stickyRoles.some(r => r.role_id === role.id);

            if (!isSticky) {
                return interaction.reply({
                    content: `${role} is not a sticky role.`,
                    ephemeral: true
                });
            }

            await removeStickyRole(interaction.guild.id, role.id);

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('✅ Sticky Role Removed')
                .setDescription(`${role} is no longer a sticky role.`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: 'Something went wrong removing the sticky role.',
                ephemeral: true
            });
        }
    }
};

