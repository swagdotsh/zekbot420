const {
    SlashCommandBuilder,
    InteractionContextType,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('helptz')
        .setDescription('Get help with GMT timezone formats')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .setIntegrationTypes(0, 1),

    async execute(interaction) {
        return interaction.reply({
            content:
                `A full list of GMT timezones can be found [here](https://docs.sentinel.thalesgroup.com/softwareandservices/ems/EMSdocs/WSG/Content/TimeZone.htm).\n` +
                `-# If you're setting up your timezone and it is, for example, **GMT-05:00**, please write it as **GMT-5** on the bot.`,
            ephemeral: true,
        });
    },
};