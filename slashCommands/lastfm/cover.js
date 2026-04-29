const axios = require('axios');
const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cover')
        .setDescription('Show the album cover for your last played track (Last.fm)')
        .addStringOption((opt) =>
            opt
                .setName('username')
                .setDescription('Last.fm username (optional if linked)')
                .setRequired(false)
        )
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        await interaction.deferReply();

        let username = interaction.options.getString('username')

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${interaction.user.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return interaction.editReply('Provide a Last.fm username or link your account with `/linklastfm`.');
        }

        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return interaction.editReply('Missing `LASTFM_API_KEY` in the bot environment.');

        const recentUrl =
            `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
            `&user=${encodeURIComponent(username)}` +
            `&api_key=${encodeURIComponent(apiKey)}` +
            `&format=json&limit=1`;

        try {
            const { data } = await axios.get(recentUrl);
            const track = data?.recenttracks?.track?.[0];

            if (!track) return interaction.editReply(`No recent tracks found for **${username}**.`);

            const song = track?.name;
            const artist = track?.artist?.['#text'];
            const album = track?.album?.['#text'];

            if (!artist || !album) {
                return interaction.editReply(`I couldn't determine the album for **${song || 'that track'}**.`);
            }

            const albumInfoUrl =
                `https://ws.audioscrobbler.com/2.0/?method=album.getInfo` +
                `&api_key=${encodeURIComponent(apiKey)}` +
                `&format=json` +
                `&artist=${encodeURIComponent(artist)}` +
                `&album=${encodeURIComponent(album)}`;

            const { data: albumData } = await axios.get(albumInfoUrl);

            const images = albumData?.album?.image || [];
            const pick = (size) => images.find((img) => img.size === size)?.['#text'];

            const coverUrl =
                pick('extralarge') ||
                pick('mega') ||
                pick('large') ||
                pick('medium') ||
                pick('small') ||
                null;

            if (!coverUrl) return interaction.editReply(`No album cover found for **${artist} — ${album}**.`);

            const albumUrl = albumData?.album?.url;

            const embed = {
                color: 0xd51007,
                title: `${artist} — ${album}`,
                url: albumUrl || undefined,
                description: song ? `Track: **${song}**` : undefined,
                image: { url: coverUrl },
                footer: { text: `Last.fm • ${username}` }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply('Couldn’t fetch the album cover right now—try again in a moment.');
        }
    }
};