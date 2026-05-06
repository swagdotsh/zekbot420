const axios = require('axios');

const FN_API_KEY = process.env.FORTNITE_API_KEY;
const ACCOUNT_TYPES = ['epic', 'psn', 'xbl'];
const TIME_WINDOWS = ['season', 'lifetime'];

module.exports = {
    name: 'fnstats',
    aliases: ['fortnite', 'fnstat', 'fort'],
    async execute(message, args) {
        if (!args.length) return message.reply('Usage: `,fnstats <username> [epic/psn/xbl] [season/lifetime]`');

        let accountType = 'epic';
        let timeWindow = 'lifetime';
        const nameArgs = [];

        for (const arg of args) {
            if (ACCOUNT_TYPES.includes(arg.toLowerCase())) accountType = arg.toLowerCase();
            else if (TIME_WINDOWS.includes(arg.toLowerCase())) timeWindow = arg.toLowerCase();
            else nameArgs.push(arg);
        }

        const name = nameArgs.join(' ');
        if (!name) return message.reply('Please provide a username.');

        try {
            const res = await axios.get('https://fortnite-api.com/v2/stats/br/v2', {
                headers: { Authorization: FN_API_KEY },
                params: { name, accountType, timeWindow }
            });

            const { account, battlePass, stats } = res.data.data;   
            const overall = stats?.all?.overall;

            if (!overall) return message.reply(`No stats found for **${name}**.`);

            const kd = overall.kd?.toFixed(2) ?? 'N/A';
            const winRate = overall.winRate != null ? `${(overall.winRate).toFixed(1)}%` : 'N/A';

            await message.reply({
                embeds: [{
                    color: 0x8B5CF6,
                    title: `📊 ${account.name}'s Fortnite Stats`,
                    description: `**Account:** ${accountType.toUpperCase()} • **Window:** ${timeWindow.charAt(0).toUpperCase() + timeWindow.slice(1)} • **Battle Pass Level:** ${battlePass.level}`,
                    fields: [
                        { name: '🏆 Wins', value: `${overall.wins?.toLocaleString() ?? 'N/A'}`, inline: true },
                        { name: '💀 Kills', value: `${overall.kills?.toLocaleString() ?? 'N/A'}`, inline: true },
                        { name: '🎯 K/D', value: kd, inline: true },
                        { name: '🎮 Matches', value: `${overall.matches?.toLocaleString() ?? 'N/A'}`, inline: true },
                        { name: '📈 Win Rate', value: winRate, inline: true },
                        { name: '⏱️ Minutes Played', value: `${overall.minutesPlayed?.toLocaleString() ?? 'N/A'}`, inline: true },
                    ],
                    footer: { text: 'Powered by fortnite-api.com' },
                    timestamp: new Date()
                }]
            });

        } catch (err) {
            const status = err.response?.status;
            if (status === 404) return message.reply(`Player **${name}** not found.`);
            if (status === 403) return message.reply('Stats are private for this account.');
            console.error(err.response?.data || err.message);
            await message.reply('Failed to fetch stats. Try again later.');
        }
    }
};