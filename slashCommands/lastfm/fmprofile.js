const {
    InteractionContextType,
    SlashCommandBuilder,
} = require('discord.js');
const fmProfileCommand = require('../../commands/lastfm/fmprofile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fmprofile')
        .setDescription('Show a summary of your linked Last.fm profile')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .setIntegrationTypes(0, 1),

    async execute(interaction) {
        await interaction.deferReply();

        return fmProfileCommand.execute({
            author: interaction.user,
            channel: interaction.channel,
            reply: (payload) => interaction.editReply(payload),
        });
    },
};
