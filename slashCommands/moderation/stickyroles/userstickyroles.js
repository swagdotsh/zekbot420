const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, InteractionContextType } = require('discord.js');
const { addUserStickyRole, removeUserStickyRole } = require('../../../stickyrolesDbHndlr');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userstickyroles')
        .setDescription("View a user's sticky roles")
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Add a sticky role to a user')
                .addUserOption((opt) =>
                    opt
                        .setName('user')
                        .setDescription('The user to add sticky role to')
                        .setRequired(true)
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('role')
                        .setDescription('The role to add as sticky')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove a sticky role from a user')
                .addUserOption((opt) =>
                    opt
                        .setName('user')
                        .setDescription('The user to remove sticky role from')
                        .setRequired(true)
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('role')
                        .setDescription('The role to remove from sticky')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');

        try {
            if (subcommand === 'add') {
                await addUserStickyRole(interaction.guild.id, user.id, role.id);
                const embed = new EmbedBuilder()
                    .setColor('#00ff88')
                    .setTitle('✅ Sticky Role Added to User')
                    .setDescription(`${user} will now keep ${role} if they rejoin.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            } else if (subcommand === 'remove') {
                await removeUserStickyRole(interaction.guild.id, user.id, role.id);
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('✅ Sticky Role Removed from User')
                    .setDescription(`${user} will no longer keep ${role} if they rejoin.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: 'Something went wrong updating user sticky roles.',
                ephemeral: true
            });
        }
    }
};

