const {
    SlashCommandBuilder,
    InteractionContextType
} = require('discord.js');
const {
    getManagedChannel,
    isVoiceMasterOrStaff,
    deleteManagedChannel
} = require('./_vmManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dvc')
        .setDescription('Delete your VoiceMaster VC')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0),

    async execute(interaction) {
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: 'You need to be in a VoiceMaster VC to use this command.',
                ephemeral: true
            });
        }

        const managed = getManagedChannel(interaction.client, voiceChannel.id);

        if (!managed) {
            return interaction.reply({
                content: 'This is not a VoiceMaster VC.',
                ephemeral: true
            });
        }

        if (!isVoiceMasterOrStaff(interaction.member, managed)) {
            return interaction.reply({
                content: 'Only the voicemaster or staff with **Manage Channels** can use this command.',
                ephemeral: true
            });
        }

        await interaction.reply('Deleting this VoiceMaster VC.');

        await deleteManagedChannel(
            interaction.client,
            voiceChannel.id,
            `VoiceMaster VC deleted by ${interaction.user.tag}`
        );
    }
};