const axios = require('axios');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

function parseQuotedTrackArtistUsername(args) {
    const raw = (args || []).join(' ').trim();
    if (!raw) return { track: null, artist: null, username: null };

    // Expected:
    //   "Track Name" "Artist Name" username?
    const m = raw.match(/^"([^"]+)"\s+"([^"]+)"\s*(.*)$/);
    if (!m) return { track: null, artist: null, username: null };

    const track = m[1].trim() || null;
    const artist = m[2].trim() || null;
    const rest = (m[3] || '').trim();
    const username = rest ? rest.split(/\s+/)[0] : null;

    return { track, artist, username };
}

async function getRecentTrack({ apiKey, username }) {
    const recentUrl =
        `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks` +
        `&user=${encodeURIComponent(username)}` +
        `&api_key=${encodeURIComponent(apiKey)}` +
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
    name: 'trackplays',
    aliases: ['tp'],
    async execute(message, args) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');

        const parsed = parseQuotedTrackArtistUsername(args);
        let username = parsed.username

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return message.reply(
                'Provide a Last.fm username or link yours first. Example: `,tp "No Surprises" "Radiohead" someUser`'
            );
        }

        let track = parsed.track;
        let artist = parsed.artist;

        try {
            if (!track || !artist) {
                if ((args || []).length) {
                    return message.reply(
                        'For track plays, please use: `,tp "Track Name" "Artist Name" [username]` (quotes required when there are spaces). ' +
                        'Or run `,tp` with no args to use your currently playing track.'
                    );
                }

                const recent = await getRecentTrack({ apiKey, username });
                track = recent.track;
                artist = recent.artist;

                if (!track || !artist) {
                    return message.reply(`I couldn't determine the current track for **${username}**.`);
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

            return message.reply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return message.reply('Couldn’t fetch track plays right now—try again in a moment.');
        }
    }
};