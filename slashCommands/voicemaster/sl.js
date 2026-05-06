const {
    SlashCommandBuilder,
    InteractionContextType
} = require('discord.js');
const {
    getManagedChannel,
    isVoiceMasterOrStaff
} = require('./_vmManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sl')
        .setDescription('Set or remove the user limit for your VoiceMaster VC')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addIntegerOption((opt) =>
            opt
                .setName('limit')
                .setDescription('User limit from 2-99. Use 0 or leave blank to remove the limit.')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(99)
        ),

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

        const limit = interaction.options.getInteger('limit');

        if (limit === null || limit === 0) {
            await voiceChannel.setUserLimit(0, `VoiceMaster limit removed by ${interaction.user.tag}`);

            return interaction.reply('VC user limit removed.');
        }

        if (limit === 1) {
            return interaction.reply({
                content:
                    'Please provide a user limit from **2** to **99**.\n' +
                    'Use `0` or run `/sl` with no input to remove the limit.',
                ephemeral: true
            });
        }

        await voiceChannel.setUserLimit(limit, `VoiceMaster limit changed by ${interaction.user.tag}`);

        return interaction.reply(`VC user limit set to **${limit}**.`);
    }
};