const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Show a recently deleted message in this channel')
        .setContexts(InteractionContextType.Guild)
        .addIntegerOption((opt) =>
            opt
                .setName('index')
                .setDescription('Which deleted message to snipe')
                .setRequired(false)
                .setMinValue(1)
        ),

    async execute(interaction) {
        const snipes = interaction.client.snipes.get(interaction.channel.id);

        if (!snipes || snipes.length === 0) {
            return interaction.reply({
                content: 'No message has been deleted recently in this channel.',
                ephemeral: true
            });
        }

        const index = interaction.options.getInteger('index') || 1;

        if (index < 1 || index > snipes.length) {
            return interaction.reply({
                content: `Invalid snipe index. Please use a number between 1 and ${snipes.length}.`,
                ephemeral: true
            });
        }

        const snipe = snipes[index - 1];
        const timeAgo = formatTimeAgo(Date.now() - snipe.timestamp);

        const embed = new EmbedBuilder()
            .setAuthor({
                name: snipe.user.username,
                iconURL: snipe.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(snipe.content)
            .setColor('#a903fc')
            .setFooter({ text: `${index}/${snipes.length} • Deleted ${timeAgo}` });

        return interaction.reply({ embeds: [embed] });
    }
};

function formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day(s) ago`;
    if (hours > 0) return `${hours} hour(s) ago`;
    if (minutes > 0) return `${minutes} minute(s) ago`;

    return `${seconds} second(s) ago`;
}