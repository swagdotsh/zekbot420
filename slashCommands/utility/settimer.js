const {
    SlashCommandBuilder,
    InteractionContextType
} = require('discord.js');

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
                .setDescription('Timer duration, e.g. 10m, 2h, 3d. Numbers default to minutes.')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for the timer')
                .setRequired(false)
        ),

    async execute(interaction) {
        const timeArg = interaction.options.getString('time', true).toLowerCase();
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const match = timeArg.match(/^(\d+)([mhd]?)$/);

        if (!match) {
            return interaction.reply({
                content: 'Invalid time format. Use `10m`, `2h`, `3d`, or just a number for minutes.',
                ephemeral: true
            });
        }

        const value = parseInt(match[1]);
        const unit = match[2] || 'm';

        let ms;

        if (unit === 'm') ms = value * 60 * 1000;
        else if (unit === 'h') ms = value * 60 * 60 * 1000;
        else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;

        if (ms > 2147483647) {
            return interaction.reply({
                content: 'Timer is too long. Max is about 24 days.',
                ephemeral: true
            });
        }

        if (ms <= 0) {
            return interaction.reply({
                content: 'Time must be greater than 0.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `⏳ Timer set for ${timeArg}. I’ll DM you when it’s done.`,
            ephemeral: true
        });

        setTimeout(async () => {
            try {
                await interaction.user.send(`⏰ Timer finished: ${reason}`);
            } catch (err) {
                console.error('Failed to send timer DM:', err);
            }
        }, ms);
    }
};