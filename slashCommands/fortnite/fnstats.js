const axios = require('axios');
const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

const FN_API_KEY = process.env.FORTNITE_API_KEY;
const ACCOUNT_TYPES = ['epic', 'psn', 'xbl'];
const TIME_WINDOWS = ['season', 'lifetime'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fnstats')
        .setDescription('Fetch Fortnite BR stats for a player')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption(option =>
            option.setName('username')
                .setDescription('The player\'s username')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Account platform (default: epic)')
                .addChoices(
                    { name: 'Epic', value: 'epic' },
                    { name: 'PlayStation', value: 'psn' },
                    { name: 'Xbox', value: 'xbl' }
                )
        )
        .addStringOption(option =>
            option.setName('window')
                .setDescription('Time window (default: lifetime)')
                .addChoices(
                    { name: 'Lifetime', value: 'lifetime' },
                    { name: 'Season', value: 'season' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const name = interaction.options.getString('username');
        const accountType = interaction.options.getString('platform') ?? 'epic';
        const timeWindow = interaction.options.getString('window') ?? 'lifetime';

        try {
            const res = await axios.get('https://fortnite-api.com/v2/stats/br/v2', {
                headers: { Authorization: FN_API_KEY },
                params: { name, accountType, timeWindow }
            });

            const { account, battlePass, stats } = res.data.data;
            const overall = stats?.all?.overall;

            if (!overall) {
                return interaction.editReply(`No stats found for **${name}**.`);
            }

            const kd = overall.kd?.toFixed(2) ?? 'N/A';
            const winRate = overall.winRate != null ? `${overall.winRate.toFixed(1)}%` : 'N/A';

            const embed = new EmbedBuilder()
                .setColor(0x8B5CF6)
                .setTitle(`📊 ${account.name}'s Fortnite Stats`)
                .setDescription(`**Platform:** ${accountType.toUpperCase()} • **Window:** ${timeWindow.charAt(0).toUpperCase() + timeWindow.slice(1)} • **Battle Pass Level:** ${battlePass.level}`)
                .addFields(
                    { name: '🏆 Wins', value: `${overall.wins?.toLocaleString() ?? 'N/A'}`, inline: true },
                    { name: '💀 Kills', value: `${overall.kills?.toLocaleString() ?? 'N/A'}`, inline: true },
                    { name: '🎯 K/D', value: kd, inline: true },
                    { name: '🎮 Matches', value: `${overall.matches?.toLocaleString() ?? 'N/A'}`, inline: true },
                    { name: '📈 Win Rate', value: winRate, inline: true },
                    { name: '⏱️ Minutes Played', value: `${overall.minutesPlayed?.toLocaleString() ?? 'N/A'}`, inline: true },
                )
                .setFooter({ text: 'Powered by fortnite-api.com' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (err) {
            const status = err.response?.status;
            if (status === 404) return interaction.editReply(`Player **${name}** not found.`);
            if (status === 403) return interaction.editReply('Stats are private for this account.');
            console.error(err.response?.data || err.message);
            return interaction.editReply('Failed to fetch stats. Try again later.');
        }
    }
};