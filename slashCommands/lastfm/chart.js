const {
    InteractionContextType,
    SlashCommandBuilder,
} = require('discord.js');
const chartCommand = require('../../commands/lastfm/chart');

const SIZE_CHOICES = [];
for (let columns = 1; columns <= 5; columns++) {
    for (let rows = 1; rows <= 5; rows++) {
        SIZE_CHOICES.push({ name: `${columns}x${rows}`, value: `${columns}x${rows}` });
    }
}

function interactionMessage(interaction) {
    return {
        author: interaction.user,
        reply: (payload) => interaction.editReply(payload),
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chart')
        .setDescription('Build a Last.fm album or artist collage')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .setIntegrationTypes(0, 1)
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('What to chart')
                .setRequired(true)
                .addChoices(
                    { name: 'Albums', value: 'albums' },
                    { name: 'Artists', value: 'artists' }
                )
        )
        .addStringOption((option) =>
            option
                .setName('size')
                .setDescription('Grid size')
                .setRequired(true)
                .addChoices(...SIZE_CHOICES)
        )
        .addStringOption((option) =>
            option
                .setName('period')
                .setDescription('Listening period')
                .setRequired(false)
                .addChoices(
                    { name: 'Past 7 days', value: '7d' },
                    { name: 'Past 30 days', value: '30d' },
                    { name: 'Past 3 months', value: '3m' },
                    { name: 'Past 6 months', value: '6m' },
                    { name: 'Past year', value: '1y' },
                    { name: 'All-time', value: 'all-time' }
                )
        )
        .addStringOption((option) =>
            option
                .setName('username')
                .setDescription('Last.fm username, optional if linked')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const args = [
            interaction.options.getString('type', true),
            interaction.options.getString('size', true),
            interaction.options.getString('period') || '7d',
        ];
        const username = interaction.options.getString('username');
        if (username) args.push(username);

        return chartCommand.execute(interactionMessage(interaction), args);
    },
};
