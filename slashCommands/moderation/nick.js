const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType,
    MessageFlags
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change or reset a member nickname')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to change the nickname for')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('nickname')
                .setDescription('The new nickname. Leave blank to reset it.')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
            return interaction.reply({
                content: 'You need the Manage Members permission to use this command. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral
            });
        }

        const target = interaction.options.getMember('user');
        const newNickname = interaction.options.getString('nickname')?.trim() || null;

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!target.manageable) {
            return interaction.reply({
                content: 'I can’t change that nickname.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            await target.setNickname(newNickname);

            if (newNickname) {
                return interaction.reply({
                    content: `Changed ${target.user.username}'s nickname to **${newNickname}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: `Reset ${target.user.username}'s nickname.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error('Error changing nickname:', err);

            return interaction.reply({
                content: 'Something went wrong while changing that nickname.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
