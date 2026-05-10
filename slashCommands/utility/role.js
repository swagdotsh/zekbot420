const {
    SlashCommandBuilder,
    PermissionFlagsBits,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove a role from a user.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to give or remove the role from.')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('The role to give or remove.')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'You need the `Manage Roles` permission to use this command. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'I need the `Manage Roles` permission to do that. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const targetMember = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');

        if (!targetMember) {
            return interaction.reply({
                content: 'I could not find that member. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (!role) {
            return interaction.reply({
                content: 'I could not find that role. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (role.managed) {
            return interaction.reply({
                content: 'I cannot manage that role because it is managed by an integration or bot. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: 'I cannot manage that role because it is higher than or equal to my highest role. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (
            interaction.member.id !== interaction.guild.ownerId &&
            role.position >= interaction.member.roles.highest.position
        ) {
            return interaction.reply({
                content: 'You cannot manage that role because it is higher than or equal to your highest role. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const hasRole = targetMember.roles.cache.has(role.id);

        if (hasRole) {
            await targetMember.roles.remove(role);

            return interaction.reply({
                content: `✅ Removed **${role.name}** from **${targetMember.user.tag}**.`,
            });
        }

        await targetMember.roles.add(role);

        return interaction.reply({
            content: `✅ Gave **${role.name}** to **${targetMember.user.tag}**.`,
        });
    },
};