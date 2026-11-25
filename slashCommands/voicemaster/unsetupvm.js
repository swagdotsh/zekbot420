const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType,
    MessageFlags
} = require('discord.js');
const { ok, fail } = require('../../ui');
const { unsetupVoiceMaster } = require('./_vmManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsetupvm')
        .setDescription('Remove VoiceMaster setup from this server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption((opt) =>
            opt
                .setName('confirm')
                .setDescription('Confirm that you want to delete the Join to Create VC and saved config')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            interaction.user.id !== interaction.guild.ownerId
        ) {
            return interaction.reply({
                content: fail('You need the `Administrator` permission to use this.'),
                flags: MessageFlags.Ephemeral
            });
        }

        const confirmed = interaction.options.getBoolean('confirm');

        if (!confirmed) {
            return interaction.reply({
                content: 'Cancelled. Set `confirm` to True to remove VoiceMaster.',
                flags: MessageFlags.Ephemeral
            });
        }

        return unsetupVoiceMaster(interaction);
    }
};
