const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Show how long zekbot420 has been online'),

    execute(interaction) {
        const uptime = formatUptime(process.uptime());

        return interaction.reply({
            content: `**zekbot420** has been up for \`${uptime}\`.`
        });
    }
};

function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}