const {
    SlashCommandBuilder,
    InteractionContextType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remindme')
        .setDescription('Set a reminder for a specific date')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption((opt) =>
            opt
                .setName('date')
                .setDescription('Reminder date in MM-DD-YYYY format')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('What to remind you about')
                .setRequired(false)
        ),

    async execute(interaction) {
        const dateArg = interaction.options.getString('date');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const [month, day, year] = dateArg.split('-').map(Number);

        if (!month || !day || !year) {
            return interaction.reply({
                content: 'Invalid date format. Use `MM-DD-YYYY`.',
                ephemeral: true
            });
        }

        const targetDate = new Date(year, month - 1, day);

        if (
            isNaN(targetDate.getTime()) ||
            targetDate.getMonth() !== month - 1 ||
            targetDate.getDate() !== day ||
            targetDate.getFullYear() !== year
        ) {
            return interaction.reply({
                content: 'Invalid date.',
                ephemeral: true
            });
        }

        const now = new Date();

        if (targetDate <= now) {
            return interaction.reply({
                content: 'That date is in the past.',
                ephemeral: true
            });
        }

        const delay = targetDate.getTime() - now.getTime();

        if (delay > 2147483647) {
            return interaction.reply({
                content: 'That reminder is too far in the future.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `Reminder set for ${dateArg}. I’ll DM you when it’s time.`,
            ephemeral: true
        });

        setTimeout(async () => {
            try {
                await interaction.user.send(`⏰ Reminder: ${reason}`);
            } catch (err) {
                console.error('Failed to send reminder DM:', err);
            }
        }, delay);
    }
};