const {
    SlashCommandBuilder,
    InteractionContextType,
    MessageFlags
} = require('discord.js');
const { parseWhen, createReminder, formatDue } = require('../../reminders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settimer')
        .setDescription('Set a timer')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption((opt) =>
            opt
                .setName('time')
                .setDescription('Duration, e.g. 10m, 2h, 3d. Numbers default to minutes.')
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
        const when = parseWhen(interaction.options.getString('time', true));
        if (when.error) return interaction.reply({ content: when.error, flags: MessageFlags.Ephemeral });

        const result = await createReminder({
            userId: interaction.user.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            kind: 'timer',
            reason: interaction.options.getString('reason'),
            dueAt: when.dueAt,
        });
        if (result.error) return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });

        return interaction.reply({
            content: `⏳ Timer set, it finishes ${formatDue(result.dueAt)}. I'll DM you.`,
            flags: MessageFlags.Ephemeral
        });
    }
};
