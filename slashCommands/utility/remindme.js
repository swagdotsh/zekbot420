const {
    SlashCommandBuilder,
    InteractionContextType,
    MessageFlags
} = require('discord.js');
const { parseWhen, createReminder, formatDue } = require('../../reminders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remindme')
        .setDescription('Set a reminder')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption((opt) =>
            opt
                .setName('date')
                .setDescription('When: 10m, 2h30m, 3d, 1w, or MM-DD-YYYY')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('What it is for')
                .setRequired(false)
                .setMaxLength(1000)
        ),

    async execute(interaction) {
        const when = parseWhen(interaction.options.getString('date', true));
        if (when.error) return interaction.reply({ content: when.error, flags: MessageFlags.Ephemeral });

        const result = await createReminder({
            userId: interaction.user.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            kind: 'reminder',
            reason: interaction.options.getString('reason'),
            dueAt: when.dueAt,
        });
        if (result.error) return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });

        return interaction.reply({
            content: `⏰ I'll remind you ${formatDue(result.dueAt)}. I'll DM you.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
