const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show information about zekbot420'),

    execute(interaction) {
        return interaction.reply({
            content:
                `# zekbot420 is your favorite Discord's bot free and open-source alternative, developed by zekkie.\n` +
                `If you want a list of all commands, use **/help**.\n` +
                `If you want to contribute, or take a look at the source code, [check out the repository](https://github.com/himynameisdon/zekbot420)!\n` +
                `-# Licensed under the MIT License. Copyright (c) 2023-2026 zekkie/swagrelated.com. All rights reserved.`,
        });
    }
};