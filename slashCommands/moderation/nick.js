const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType
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
                ephemeral: true
            });
        }

        const target = interaction.options.getMember('user');
        const newNickname = interaction.options.getString('nickname')?.trim() || null;

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                ephemeral: true
            });
        }

        if (!target.manageable) {
            return interaction.reply({
                content: 'I can’t change that nickname.',
                ephemeral: true
            });
        }

        try {
            await target.setNickname(newNickname);

            if (newNickname) {
                return interaction.reply({
                    content: `Changed ${target.user.username}'s nickname to **${newNickname}**.`,
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `Reset ${target.user.username}'s nickname.`,
                ephemeral: true
            });
        } catch (err) {
            console.error('Error changing nickname:', err);

            return interaction.reply({
                content: 'Something went wrong while changing that nickname.',
                ephemeral: true
            });
        }
    }
};
