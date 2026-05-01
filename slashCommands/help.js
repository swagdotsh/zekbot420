const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with zekbot420')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        await interaction.reply({
            content: `# Hi ${interaction.user}!\nAll commands are available on the [bot's website](https://zekbot420.swagrelated.com/commands).\nIf you have any problems, visit the **[Issues tab](https://github.com/justadonisstar/zekbot420/issues)** to report or see if it already is.`,
            allowedMentions: { repliedUser: false }
        });
    }
};