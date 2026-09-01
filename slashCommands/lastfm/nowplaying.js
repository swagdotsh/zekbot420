const axios = require('axios');
const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")
const sharp = require('sharp');

const sql = neon(process.env.NEON_DATABASE_URL)

async function getCoverArtColor(albumArt) {
    if (!albumArt) return 0xd51007;

    try {
        const { data } = await axios.get(albumArt, { responseType: 'arraybuffer' });
        const { data: pixels } = await sharp(data)
            .resize(1, 1, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        return (pixels[0] << 16) | (pixels[1] << 8) | pixels[2];
    } catch (err) {
        console.log('Error fetching album art color:', err.message);
        return 0xd51007;
    }
}

function trackKey(track) {
    const name = String(track?.name ?? '').trim().toLowerCase();
    const artist = String(track?.artist?.['#text'] ?? track?.artist?.name ?? '').trim().toLowerCase();
    return `${name}\u0000${artist}`;
}

function ordinal(value) {
    const remainder = value % 100;
    if (remainder >= 11 && remainder <= 13) return `${value}th`;
    if (value % 10 === 1) return `${value}st`;
    if (value % 10 === 2) return `${value}nd`;
    if (value % 10 === 3) return `${value}rd`;
    return `${value}th`;
}

function consecutivePlayStreak(tracks) {
    const list = Array.isArray(tracks) ? tracks : tracks ? [tracks] : [];
    if (!list.length) return 0;
    const firstKey = trackKey(list[0]);
    if (!firstKey || firstKey === '\u0000') return 0;

    let streak = 0;
    for (const track of list) {
        if (trackKey(track) !== firstKey) break;
        streak++;
    }
    return streak;
}

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
            `&format=json&limit=200`;

        try {
            const { data } = await axios.get(url);
            const recentTracks = Array.isArray(data?.recenttracks?.track)
                ? data.recenttracks.track
                : data?.recenttracks?.track ? [data.recenttracks.track] : [];
            const track = recentTracks[0];

            if (!track) return interaction.editReply("No recent tracks found for **"+username+"**.");

            const isPlaying = track['@attr']?.nowplaying === 'true';
            const song = track?.name;
            const artist = track?.artist?.['#text'];
            const album = track?.album?.['#text'];
            const albumArt = track?.image?.[3]?.['#text'] || track?.image?.at?.(-1)?.['#text'] || null;
            const trackUrl = track?.url;
            const embedColor = await getCoverArtColor(albumArt);

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
            const streak = consecutivePlayStreak(recentTracks);
            const streakText = streak > 5 ? ` • 🔥 ${ordinal(streak)} play in a row!` : '';

            const embed = {
                color: embedColor,
                author: { name: isPlaying ? '🎵 Now Playing' : '⏮ Last Played' },
                title: song || 'Unknown track',
                url: trackUrl || undefined,
                description: artist ? `**${artist}**${album ? ` • *${album}*` : ''}` : undefined,
                thumbnail: albumArt ? { url: albumArt } : undefined,
                footer: { text: `${footerLabel} • ${username}${playsText}${streakText}` }
            };

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return interaction.editReply("Couldn't find that Last.fm user. Double-check the username!");
        }
    }
};
