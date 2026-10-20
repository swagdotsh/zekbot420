const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, InteractionContextType } = require('discord.js');
const { addStickyRole } = require('../../../stickyrolesDbHndlr');
const { roleAssignBlocker } = require('../../../hierarchy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addstickyrole')
        .setDescription('Add a sticky role')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addRoleOption((opt) =>
            opt
                .setName('role')
                .setDescription('The role to mark as sticky')
                .setRequired(true)
        ),

    async execute(interaction) {
        const role = interaction.options.getRole('role');

        const blocker = roleAssignBlocker(interaction.member, role);
        if (blocker) return interaction.reply({ content: blocker, ephemeral: true });

        try {
            await addStickyRole(interaction.guild.id, role.id);

            const embed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('✅ Sticky Role Added')
                .setDescription(`${role} is now a sticky role.\n\n**Note:** Sticky roles must be enabled using \`/stickyroles action: Enable\` to take effect.`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: 'Something went wrong adding the sticky role.',
                ephemeral: true
            });
        }
    }
};

