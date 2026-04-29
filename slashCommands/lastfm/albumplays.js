const axios = require('axios');
const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

async function getRecentAlbum({ apiKey, username }) {
    const recentUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json&limit=1`;

    const { data } = await axios.get(recentUrl);
    const track = data?.recenttracks?.track?.[0];

    const artist = track?.artist?.['#text'] || null;
    const album = track?.album?.['#text'] || null;

    return { artist, album, track };
}

async function getAlbumInfo({ apiKey, username, artist, album }) {
    const infoUrl =
        `https://ws.audioscrobbler.com/2.0/?method=album.getInfo` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json` +
        `&username=${encodeURIComponent(username)}` +
        `&artist=${encodeURIComponent(artist)}` +
        `&album=${encodeURIComponent(album)}`;

    const { data } = await axios.get(infoUrl);
    const a = data?.album;

    const playcountRaw = a?.userplaycount;
    const allTimePlays =
        playcountRaw !== undefined && playcountRaw !== null && playcountRaw !== ''
            ? Number(playcountRaw)
            : null;

    const images = a?.image || [];
    const pick = (size) => images.find((img) => img?.size === size)?.['#text'] || null;

    const thumbnailUrl = pick('medium') || pick('small') || pick('large') || null;

    return {
        url: a?.url || null,
        name: a?.name || album,
        artistName: a?.artist || artist,
        allTimePlays,
        thumbnailUrl
    };
}

async function getAlbumPlaysFromTopAlbums({ apiKey, username, artist, album, period }) {
    const topUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getTopAlbums` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json` +
        `&period=${encodeURIComponent(period)}` +
        `&limit=200`;

    const { data } = await axios.get(topUrl);
    const albums = data?.topalbums?.album;
    const list = Array.isArray(albums) ? albums : albums ? [albums] : [];

    const targetAlbum = (album || '').toLowerCase();
    const targetArtist = (artist || '').toLowerCase();

    const match = list.find((a) => {
        const aName = (a?.name || '').toLowerCase();
        const aArtist = (a?.artist?.name || '').toLowerCase();
        return aName === targetAlbum && aArtist === targetArtist;
    });

    const plays = Number(match?.playcount ?? 0);
    return Number.isFinite(plays) ? plays : 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('albumplays')
        .setDescription('Show your play count for an album on Last.fm')
        .addStringOption((opt) =>
            opt
                .setName('album')
                .setDescription('Album name, optional to use your current/recent album')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('artist')
                .setDescription('Artist name, required if album is provided')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('username')
                .setDescription('Last.fm username, optional if linked')
                .setRequired(false)
        )
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        await interaction.deferReply();

        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return interaction.editReply('Missing `LASTFM_API_KEY` in the bot environment.');

        let username = interaction.options.getString('username')

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${interaction.user.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return interaction.editReply('Provide a Last.fm username or link yours with `/linklastfm`.');
        }

        let album = interaction.options.getString('album');
        let artist = interaction.options.getString('artist');

        try {
            if ((album && !artist) || (!album && artist)) {
                return interaction.editReply('Please provide both `album` and `artist`, or neither to use your current/recent album.');
            }

            if (!artist || !album) {
                const recent = await getRecentAlbum({ apiKey, username });
                artist = recent.artist;
                album = recent.album;

                if (!artist || !album) {
                    return interaction.editReply(`I couldn't determine the current album for **${username}**.`);
                }
            }

            const [{ url, name, artistName, allTimePlays, thumbnailUrl }, weekPlays] =
                await Promise.all([
                    getAlbumInfo({ apiKey, username, artist, album }),
                    getAlbumPlaysFromTopAlbums({ apiKey, username, artist, album, period: '7day' })
                ]);

            const allTimeText =
                typeof allTimePlays === 'number' && Number.isFinite(allTimePlays)
                    ? `${allTimePlays.toLocaleString()} play${allTimePlays === 1 ? '' : 's'}`
                    : '— plays';

            const embed = {
                color: 0xd51007,
                author: { name: 'Album plays' },
                title: name,
                url: url || undefined,
                description: `by **${artistName}**\n**All‑time:** ${allTimeText}`,
                thumbnail: thumbnailUrl ? { url: thumbnailUrl } : null,
                footer: {
                    text: `Last week: ${Number(weekPlays).toLocaleString()} • ${username}`
                }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply('Couldn’t fetch album plays right now—try again in a moment.');
        }
    }
};