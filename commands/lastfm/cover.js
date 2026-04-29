const axios = require('axios');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    name: 'cover',
    aliases: ['albumcover', 'art', 'acover', 'coverart'],
    async execute(message, args) {
        let username = args[0]

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) return message.reply('Provide a Last.fm username or link your account with `,linklastfm`!');

        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');

        const recentUrl =
            `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
            `&user=${encodeURIComponent(username)}` +
            `&api_key=${encodeURIComponent(apiKey)}` +
            `&format=json&limit=1`;

        try {
            const { data } = await axios.get(recentUrl);
            const track = data?.recenttracks?.track?.[0];

            if (!track) return message.reply(`No recent tracks found for **${username}**.`);

            const isPlaying = track['@attr']?.nowplaying === 'true';
            const song = track?.name;
            const artist = track?.artist?.['#text'];
            const album = track?.album?.['#text'];

            if (!artist || !album) {
                return message.reply(
                    `I couldn't determine the album for **${song || 'that track'}** (user: **${username}**).`
                );
            }

            const albumInfoUrl =
                `https://ws.audioscrobbler.com/2.0/?method=album.getInfo` +
                `&api_key=${encodeURIComponent(apiKey)}` +
                "&format=json" +
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

            if (!coverUrl) {
                return message.reply(`No album cover found for **${artist} — ${album}**.`);
            }

            const albumUrl = albumData?.album?.url;

            const embed = {
                color: 0xd51007,
                author: { name: isPlaying ? '🎵 Album cover (Now Playing)' : 'Album cover (Last Played)' },
                title: `${artist} — ${album}`,
                url: albumUrl || undefined,
                description: song ? `Track: **${song}**` : undefined,
                image: { url: coverUrl },
                footer: { text: `Last.fm • ${username}` }
            };

            return message.reply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return message.reply('Couldn’t fetch the album cover right now—try again in a moment.');
        }
    }
};