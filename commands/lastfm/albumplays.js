const axios = require('axios');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

function parseQuotedAlbumArtistUsername(args) {
    const raw = (args || []).join(' ').trim();
    if (!raw) return { album: null, artist: null, username: null };

    // Expected:
    //   "Album Name" "Artist Name" username?
    // Album and Artist MUST be quoted if they have spaces.
    const m = raw.match(/^"([^"]+)"\s+"([^"]+)"\s*(.*)$/);
    if (!m) return { album: null, artist: null, username: null };

    const album = m[1].trim() || null;
    const artist = m[2].trim() || null;
    const rest = (m[3] || '').trim();
    const username = rest ? rest.split(/\s+/)[0] : null;

    return { album, artist, username };
}

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

    // "Side image" thumbnail (prefer medium/small)
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
    name: 'albumplays',
    aliases: ['alp'],
    async execute(message, args) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');

        const parsed = parseQuotedAlbumArtistUsername(args);
        let username = parsed.username

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return message.reply(
                'Provide a Last.fm username or link yours first. Example: `,alp "The Dark Side of the Moon" "Pink Floyd" someUser`'
            );
        }

        let artist = parsed.artist;
        let album = parsed.album;

        try {
            if (!artist || !album) {
                if ((args || []).length) {
                    return message.reply(
                        'For album plays, please use: `,alp "Album Name" "Artist Name" [username]` (quotes required when there are spaces). ' +
                        'Or run `,alp` with no args to use your currently playing album.'
                    );
                }

                const recent = await getRecentAlbum({ apiKey, username });
                artist = recent.artist;
                album = recent.album;

                if (!artist || !album) {
                    return message.reply(`I couldn't determine the current album for **${username}**.`);
                }
            }

            const [{ url, name, artistName, allTimePlays, thumbnailUrl }, weekPlays, dayPlays] =
                await Promise.all([
                    getAlbumInfo({ apiKey, username, artist, album }),
                    getAlbumPlaysFromTopAlbums({ apiKey, username, artist, album, period: '7day' }),
                    getAlbumPlaysFromTopAlbums({ apiKey, username, artist, album, period: '1day' })
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
                    text:
                        `Last week: ${Number(weekPlays).toLocaleString()} • ` +
                        `${username}`
                }
            };

            return message.reply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return message.reply('Couldn’t fetch album plays right now—try again in a moment.');
        }
    }
};