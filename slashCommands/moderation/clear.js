const {
    SlashCommandBuilder,
    InteractionContextType,
    PermissionFlagsBits
} = require('discord.js');
const { logClearMessages } = require('../../log');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear messages')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption((opt) =>
            opt
                .setName('amount')
                .setDescription('Number of messages to clear')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        try {
            const messages = await interaction.channel.messages.fetch({ limit: amount });

            const messagesContent = messages
                .map((msg) => `[${msg.author.tag}] (${msg.createdAt}): ${msg.content}`)
                .join('\n');

            await interaction.channel.bulkDelete(messages, true);

            await logClearMessages(
                interaction.client,
                interaction,
                interaction.user,
                amount,
                messagesContent
            );

            const reply = await interaction.reply({
                content: `Cleared ${messages.size} messages.`,
                fetchReply: true
            });

            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Failed to clear messages.',
                ephemeral: true
            });
        }
    }
};