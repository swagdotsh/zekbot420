const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const dbPath = path.join(__dirname, '../../data/lastfm.json');

const PERIOD_MAP = {
    week: '7day',
    month: '1month',
    year: '12month'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toptracks')
        .setDescription('Show a Last.fm user’s top tracks')
        .addStringOption((opt) =>
            opt
                .setName('username')
                .setDescription('Last.fm username, optional if linked')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('period')
                .setDescription('Time period')
                .setRequired(false)
                .addChoices(
                    { name: 'Week', value: 'week' },
                    { name: 'Month', value: 'month' },
                    { name: 'Year', value: 'year' }
                )
        )
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        await interaction.deferReply();

        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return interaction.editReply('Missing `LASTFM_API_KEY` in the bot environment.');

        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        const usernameArg = interaction.options.getString('username');
        const periodKey = interaction.options.getString('period') || 'week';

        const username = usernameArg || db[interaction.user.id];
        if (!username) {
            return interaction.editReply('Provide a Last.fm username or link yours first.');
        }

        const period = PERIOD_MAP[periodKey] || PERIOD_MAP.week;
        const prettyPeriod = periodKey || 'week';

        const topUrl =
            `https://ws.audioscrobbler.com/2.0/?method=user.getTopTracks` +
            `&user=${encodeURIComponent(username)}` +
            `&api_key=${encodeURIComponent(apiKey)}` +
            `&format=json` +
            `&period=${encodeURIComponent(period)}` +
            `&limit=10`;

        try {
            const { data } = await axios.get(topUrl);

            const tracks = data?.toptracks?.track;
            const list = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];

            if (!list.length) {
                return interaction.editReply(`No top tracks found for **${username}** (${prettyPeriod}).`);
            }

            const lines = list.map((t, i) => {
                const name = t?.name || 'Unknown track';
                const artist = t?.artist?.name || 'Unknown artist';
                const plays = Number(t?.playcount ?? 0);
                const trackUrl = t?.url;

                const title = trackUrl ? `[${name}](${trackUrl})` : name;
                const playsText = Number.isFinite(plays)
                    ? `${plays.toLocaleString()} play${plays === 1 ? '' : 's'}`
                    : '— plays';

                return `**${i + 1}.** ${title} — *${artist}* • **${playsText}**`;
            });

            const embed = {
                color: 0xd51007,
                author: { name: '📈 Top Tracks' },
                title: `${username} • ${prettyPeriod}`,
                description: lines.join('\n'),
                footer: { text: 'Last.fm' }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply('Couldn’t fetch top tracks right now—try again in a moment.');
        }
    }
};