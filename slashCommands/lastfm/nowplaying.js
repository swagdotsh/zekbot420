const axios = require('axios');
const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show your current or most recently played track (Last.fm)')
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

        const url =
            `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
            `&user=${encodeURIComponent(username)}` +
            `&api_key=${encodeURIComponent(apiKey)}` +
            `&format=json&limit=1`;

        try {
            const { data } = await axios.get(url);
            const track = data?.recenttracks?.track?.[0];

            if (!track) return interaction.editReply(`No recent tracks found for **${username}**.`);

            const isPlaying = track['@attr']?.nowplaying === 'true';
            const song = track?.name;
            const artist = track?.artist?.['#text'];
            const album = track?.album?.['#text'];
            const albumArt = track?.image?.[3]?.['#text'] || track?.image?.at?.(-1)?.['#text'] || null;
            const trackUrl = track?.url;

            let userPlayCount = null;
            let userLoved = false;

            try {
                const infoUrl =
                    `https://ws.audioscrobbler.com/2.0/?method=track.getInfo` +
                    `&api_key=${encodeURIComponent(apiKey)}` +
                    `&format=json` +
                    `&username=${encodeURIComponent(username)}` +
                    `&artist=${encodeURIComponent(artist || '')}` +
                    `&track=${encodeURIComponent(song || '')}`;

                const { data: infoData } = await axios.get(infoUrl);

                const count = infoData?.track?.userplaycount;
                if (count !== undefined && count !== null && count !== '') {
                    userPlayCount = Number(count);
                }

                const loved = infoData?.track?.userloved;
                userLoved = loved === '1' || loved === 1 || loved === true;
            } catch (err) {
                console.log('Error fetching track info:', err.response?.data || err.message);
            }

            const playsText =
                typeof userPlayCount === 'number' && Number.isFinite(userPlayCount)
                    ? ` • ${userPlayCount.toLocaleString()} play${userPlayCount === 1 ? '' : 's'}`
                    : '';

            const footerLabel = userLoved ? '❤️ Loved track' : 'Last.fm';

            const embed = {
                color: 0xd51007,
                author: { name: isPlaying ? '🎵 Now Playing' : '⏮ Last Played' },
                title: song || 'Unknown track',
                url: trackUrl || undefined,
                description: artist ? `by **${artist}**${album ? ` • *${album}*` : ''}` : undefined,
                thumbnail: albumArt ? { url: albumArt } : undefined,
                footer: { text: `${footerLabel} • ${username}${playsText}` }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply("Couldn't find that Last.fm user. Double-check the username!");
        }
    }
};