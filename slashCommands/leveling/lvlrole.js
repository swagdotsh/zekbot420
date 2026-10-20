const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { setLevelRole, removeLevelRole, getLevelRoles } = require('../../leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lvlrole')
        .setDescription('Manage level roles')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('set')
                .setDescription('Set a role to be assigned at a specific level')
                .addIntegerOption((opt) =>
                    opt
                        .setName('level')
                        .setDescription('The level required for this role')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('role')
                        .setDescription('The role to assign at this level')
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Stop giving a role at a specific level')
                .addIntegerOption((opt) =>
                    opt
                        .setName('level')
                        .setDescription('The level to remove the role from')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List configured level roles')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const roles = await getLevelRoles(interaction.guild.id);

            if (!roles.length) {
                return interaction.reply({
                    content: 'No level roles set up yet.',
                    ephemeral: true
                });
            }

            const list = roles
                .map((r) => `Level ${r.level} → <@&${r.role_id}>`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🎖️ Level Roles')
                .setDescription(list);

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        if (subcommand === 'remove') {
            const level = interaction.options.getInteger('level');
            const roleId = await removeLevelRole(interaction.guild.id, level);

            return interaction.reply({
                content: roleId
                    ? `<@&${roleId}> will no longer be given at level **${level}**.`
                    : `There's no level role set for level **${level}**.`,
                ephemeral: true
            });
        }

        if (subcommand === 'set') {
            const level = interaction.options.getInteger('level');
            const role = interaction.options.getRole('role');

            if (!level || level < 1) {
                return interaction.reply({
                    content: 'Please provide a valid level number.',
                    ephemeral: true
                });
            }

            if (!role) {
                return interaction.reply({
                    content: 'Please provide a valid role.',
                    ephemeral: true
                });
            }

            try {
                await setLevelRole(interaction.guild.id, level, role.id);

                return interaction.reply({
                    content: `${role} will now be assigned when a user reaches level **${level}**.`,
                    ephemeral: true
                });
            } catch (err) {
                console.error(err);

                return interaction.reply({
                    content: 'Something went wrong saving the role.',
                    ephemeral: true
                });
            }
        }
    }
};