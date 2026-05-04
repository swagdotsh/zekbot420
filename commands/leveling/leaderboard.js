const { getLeaderboard, getConfig } = require('../../leveling');

module.exports = {
    name: 'leaderboard',
    aliases: ['lb'],
    async execute(message, args) {
        const config = await getConfig(message.guild.id);
        if (!config?.lb_enabled) return message.reply('The leaderboard is disabled in this server.');

        const rows = await getLeaderboard(message.guild.id, 10);
        if (!rows.length) return message.reply('No one has earned XP yet.');

        const medals = ['🥇', '🥈', '🥉'];
        const description = rows.map((row, i) => {
            const prefix = medals[i] || `**#${i + 1}**`;
            return `${prefix} <@${row.user_id}> — Level ${row.level} (${row.xp} XP)`;
        }).join('\n');

        await message.reply({
            embeds: [{
                color: 0x5865f2,
                title: `🏆 ${message.guild.name} Leaderboard`,
                description
            }]
        });
    }
};