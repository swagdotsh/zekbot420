const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot latency'),

    async execute(interaction) {
        const sentAt = Date.now();

        await interaction.reply({
            content: '<a:spinbot420:1498959085427490937> One second...',
        });

        const latency = Date.now() - sentAt;

        return interaction.editReply({
            content: `Pong! \`${latency}ms\``,
        });
    },
};