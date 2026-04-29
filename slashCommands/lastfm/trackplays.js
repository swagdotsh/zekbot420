const axios = require('axios');
const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

async function getRecentTrack({ apiKey, username }) {
    const recentUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
        `&user=${encodeURIComponent(username)}` +
        "&api_key="+encodeURIComponent(apiKey) +
        `&format=json&limit=1`;

    const { data } = await axios.get(recentUrl);
    const t = data?.recenttracks?.track?.[0];

    const track = t?.name || null;
    const artist = t?.artist?.['#text'] || null;

    return { track, artist, raw: t || null };
}

async function getTrackInfo({ apiKey, username, artist, track }) {
    const infoUrl =
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json` +
        `&username=${encodeURIComponent(username)}` +
        `&artist=${encodeURIComponent(artist)}` +
        `&track=${encodeURIComponent(track)}`;

    const { data } = await axios.get(infoUrl);
    const t = data?.track;

    const playcountRaw = t?.userplaycount;
    const allTimePlays =
        playcountRaw !== undefined && playcountRaw !== null && playcountRaw !== ''
            ? Number(playcountRaw)
            : null;

    const loved = t?.userloved;
    const userLoved = loved === '1' || loved === 1 || loved === true;

    const images = t?.album?.image || [];
    const pick = (size) => images.find((img) => img?.size === size)?.['#text'] || null;
    const thumbnailUrl = pick('medium') || pick('small') || pick('large') || null;

    return {
        url: t?.url || null,
        name: t?.name || track,
        artistName: t?.artist?.name || artist,
        albumName: t?.album?.title || null,
        allTimePlays,
        userLoved,
        thumbnailUrl
    };
}

async function getTrackPlaysFromTopTracks({ apiKey, username, artist, track, period }) {
    const topUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getTopTracks` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json` +
        `&period=${encodeURIComponent(period)}` +
        `&limit=500`;

    const { data } = await axios.get(topUrl);
    const tracks = data?.toptracks?.track;
    const list = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];

    const targetTrack = (track || '').toLowerCase();
    const targetArtist = (artist || '').toLowerCase();

    const match = list.find((t) => {
        const tName = (t?.name || '').toLowerCase();
        const tArtist = (t?.artist?.name || '').toLowerCase();
        return tName === targetTrack && tArtist === targetArtist;
    });

    const plays = Number(match?.playcount ?? 0);
    return Number.isFinite(plays) ? plays : 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trackplays')
        .setDescription('Show your play count for a track on Last.fm')
        .addStringOption((opt) =>
            opt
                .setName('track')
                .setDescription('Track name, optional to use your current/recent track')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('artist')
                .setDescription('Artist name, required if track is provided')
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

        let track = interaction.options.getString('track');
        let artist = interaction.options.getString('artist');

        try {
            if ((track && !artist) || (!track && artist)) {
                return interaction.editReply('Please provide both `track` and `artist`, or neither to use your current/recent track.');
            }

            if (!track || !artist) {
                const recent = await getRecentTrack({ apiKey, username });
                track = recent.track;
                artist = recent.artist;

                if (!track || !artist) {
                    return interaction.editReply(`I couldn't determine the current track for **${username}**.`);
                }
            }

            const [{ url, name, artistName, albumName, allTimePlays, userLoved, thumbnailUrl }, weekPlays, dayPlays] =
                await Promise.all([
                    getTrackInfo({ apiKey, username, artist, track }),
                    getTrackPlaysFromTopTracks({ apiKey, username, artist, track, period: '7day' }),
                    getTrackPlaysFromTopTracks({ apiKey, username, artist, track, period: '1day' })
                ]);

            const allTimeText =
                typeof allTimePlays === 'number' && Number.isFinite(allTimePlays)
                    ? `${allTimePlays.toLocaleString()} play${allTimePlays === 1 ? '' : 's'}`
                    : '— plays';

            const footerLabel = userLoved ? '❤️ Loved track' : 'Last.fm';

            const embed = {
                color: 0xd51007,
                author: { name: 'Track plays' },
                title: name,
                url: url || undefined,
                description: `by **${artistName}**${albumName ? ` • *${albumName}*` : ''}\n**All‑time:** ${allTimeText}`,
                thumbnail: thumbnailUrl ? { url: thumbnailUrl } : null,
                footer: {
                    text:
                        `${footerLabel} • ` +
                        `Last week: ${Number(weekPlays).toLocaleString()} • ` +
                        `Last day: ${Number(dayPlays).toLocaleString()} • ` +
                        `${username}`
                }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply('Couldn’t fetch track plays right now—try again in a moment.');
        }
    }
};