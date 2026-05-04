const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rs')
        .setDescription('Snipe the most recent removed reaction in this channel')
        .setContexts(InteractionContextType.Guild),

    execute(interaction) {
        const snipe = interaction.client.reactionSnipes.get(interaction.channel.id);

        if (!snipe) {
            return interaction.reply({
                content: 'No reactions to snipe.',
                ephemeral: true
            });
        }

        const timeAgo = Date.now() - snipe.time;
        const seconds = Math.floor(timeAgo / 1000) % 60;
        const minutes = Math.floor(timeAgo / (1000 * 60)) % 60;
        const hours = Math.floor(timeAgo / (1000 * 60 * 60));

        let formattedTime;

        if (hours > 0) formattedTime = `${hours}h ${minutes}m ago`;
        else if (minutes > 0) formattedTime = `${minutes}m ${seconds}s ago`;
        else formattedTime = `${seconds}s ago`;

        const embed = new EmbedBuilder()
            .setColor('Random')
            .setDescription(`**${snipe.user}** reacted to:\n"${snipe.message}"\nwith **${snipe.emoji}**`)
            .setFooter({ text: `Message by ${snipe.messageAuthor} • ${formattedTime}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};