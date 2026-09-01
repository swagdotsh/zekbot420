const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType
} = require('discord.js');
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
                content: 'You do not have the required permissions to run this command. <:smirk2:1498272372539785286>',
                ephemeral: true
            });
        }

        const confirmed = interaction.options.getBoolean('confirm');

        if (!confirmed) {
            return interaction.reply({
                content: 'VoiceMaster unsetup cancelled.',
                ephemeral: true
            });
        }

        return unsetupVoiceMaster(interaction);
    }
};
