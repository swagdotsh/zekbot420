const axios = require('axios');
const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

const PERIOD_MAP = {
    week: '7day',
    month: '1month',
    year: '12month'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topartists')
        .setDescription('Show a Last.fm user’s top artists')
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

        const usernameArg = interaction.options.getString('username');
        const periodKey = interaction.options.getString('period') || 'week';

        let username = usernameArg

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${interaction.user.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return interaction.editReply('Provide a Last.fm username or link yours first.');
        }

        const period = PERIOD_MAP[periodKey] || PERIOD_MAP.week;
        const prettyPeriod = periodKey || 'week';

        const topUrl =
            `https://ws.audioscrobbler.com/2.0/?method=user.getTopArtists` +
            `&user=${encodeURIComponent(username)}` +
            `&api_key=${encodeURIComponent(apiKey)}` +
            `&format=json` +
            `&period=${encodeURIComponent(period)}` +
            `&limit=10`;

        try {
            const { data } = await axios.get(topUrl);

            const artists = data?.topartists?.artist;
            const list = Array.isArray(artists) ? artists : artists ? [artists] : [];

            if (!list.length) {
                return interaction.editReply(`No top artists found for **${username}** (${prettyPeriod}).`);
            }

            const lines = list.map((a, i) => {
                const name = a?.name || 'Unknown artist';
                const plays = Number(a?.playcount ?? 0);
                const artistUrl = a?.url;

                const title = artistUrl ? `[${name}](${artistUrl})` : name;
                const playsText = Number.isFinite(plays)
                    ? `${plays.toLocaleString()} play${plays === 1 ? '' : 's'}`
                    : '— plays';

                return `**${i + 1}.** ${title} • **${playsText}**`;
            });

            const embed = {
                color: 0xd51007,
                author: { name: '👤 Top Artists' },
                title: `${username} • ${prettyPeriod}`,
                description: lines.join('\n'),
                footer: { text: 'Last.fm' }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply('Couldn’t fetch top artists right now—try again in a moment.');
        }
    }
};