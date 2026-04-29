const axios = require('axios');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

function parseQuotedArtistAndUsername(args) {
    const raw = (args || []).join(' ').trim();
    if (!raw) return { artist: null, username: null };

    // Artist in quotes: "Red Hot Chili Peppers" someUser
    const m = raw.match(/^"([^"]+)"\s*(.*)$/);
    if (m) {
        const artist = m[1].trim() || null;
        const rest = (m[2] || '').trim();
        const username = rest ? rest.split(/\s+/)[0] : null;
        return { artist, username };
    }

    // No quotes: assume last token is username, rest is artist (single-word artists still work)
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { artist: parts[0], username: null };

    const username = parts[parts.length - 1];
    const artist = parts.slice(0, -1).join(' ');
    return { artist: artist.trim() || null, username: username.trim() || null };
}

async function getRecentArtist({ apiKey, username }) {
    const recentUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json&limit=1`;

    const { data } = await axios.get(recentUrl);
    const track = data?.recenttracks?.track?.[0];
    const artist = track?.artist?.['#text'] || null;
    return { artist, track };
}

async function getArtistInfo({ apiKey, username, artist }) {
    const infoUrl =
        `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json` +
        `&username=${encodeURIComponent(username)}` +
        `&artist=${encodeURIComponent(artist)}`;

    const { data } = await axios.get(infoUrl);
    const a = data?.artist;

    const playcountRaw = a?.stats?.userplaycount;
    const allTimePlays =
        playcountRaw !== undefined && playcountRaw !== null && playcountRaw !== ''
            ? Number(playcountRaw)
            : null;

    const images = a?.image || [];
    const pick = (size) => images.find((img) => img?.size === size)?.['#text'] || null;

    // "Side image" = embed thumbnail (prefer medium/small rather than huge)
    const thumbnailUrl = pick('medium') || pick('small') || pick('large') || null;

    return {
        url: a?.url || null,
        name: a?.name || artist,
        allTimePlays,
        thumbnailUrl
    };
}

async function getArtistPlaysFromTopArtists({ apiKey, username, artist, period }) {
    // We fetch a reasonably large list and then find the artist. If not present, treat as 0.
    const topUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getTopArtists` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&format=json` +
        `&period=${encodeURIComponent(period)}` +
        `&limit=200`;

    const { data } = await axios.get(topUrl);
    const artists = data?.topartists?.artist;
    const list = Array.isArray(artists) ? artists : artists ? [artists] : [];

    const target = (artist || '').toLowerCase();
    const match = list.find((a) => (a?.name || '').toLowerCase() === target);

    const plays = Number(match?.playcount ?? 0);
    return Number.isFinite(plays) ? plays : 0;
}

module.exports = {
    name: 'artistplays',
    aliases: ['ap'],
    async execute(message, args) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');

        const parsed = parseQuotedArtistAndUsername(args);
        let username = parsed.username

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return message.reply(
                'Provide a Last.fm username or link yours first. Example: `,ap "Red Hot Chili Peppers" someUser`'
            );
        }

        let artist = parsed.artist;
        let nowPlayingTrack = null;

        try {
            if (!artist) {
                const recent = await getRecentArtist({ apiKey, username });
                artist = recent.artist;
                nowPlayingTrack = recent.track;

                if (!artist) {
                    return message.reply(`I couldn't determine the currently playing artist for **${username}**.`);
                }
            }

            const [{ url: artistUrl, name: artistName, allTimePlays, thumbnailUrl }, weekPlays, dayPlays] =
                await Promise.all([
                    getArtistInfo({ apiKey, username, artist }),
                    getArtistPlaysFromTopArtists({ apiKey, username, artist, period: '7day' }),
                    getArtistPlaysFromTopArtists({ apiKey, username, artist, period: '1day' })
                ]);

            const allTimeText =
                typeof allTimePlays === 'number' && Number.isFinite(allTimePlays)
                    ? `${allTimePlays.toLocaleString()} play${allTimePlays === 1 ? '' : 's'}`
                    : '— plays';

            const embed = {
                color: 0xd51007,
                author: { name: 'Artist plays' },
                title: artistName,
                url: artistUrl || undefined,
                description: `**All‑time:** ${allTimeText}`,
                thumbnail: thumbnailUrl ? { url: thumbnailUrl } : null,
                footer: {
                    text:
                        `Last week: ${Number(weekPlays).toLocaleString()} • ` +
                        `${username}`
                }
            };

            return message.reply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return message.reply('Couldn’t fetch artist plays right now—try again in a moment.');
        }
    }
};