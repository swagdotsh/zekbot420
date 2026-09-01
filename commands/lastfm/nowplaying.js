const axios = require('axios');
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
  name: 'nowplaying',
  aliases: ['np', 'fm', 'lastplayed'],
  async execute(message, args) {
    let username = args[0]

    if (!username) {
      const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`
      username = rows[0]?.lastfm_username
    }

    if (!username) return message.reply('Provide a Last.fm username or link your account with `,linklastfm`!')

    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user=${username}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=200`;

    try {
      const { data } = await axios.get(url);
      const recentTracks = Array.isArray(data?.recenttracks?.track)
        ? data.recenttracks.track
        : data?.recenttracks?.track ? [data.recenttracks.track] : [];
      const track = recentTracks[0];

      if (!track) return message.reply(`No recent tracks found for **${username}**.`);

      const isPlaying = track['@attr']?.nowplaying === 'true';
      const song = track.name;
      const artist = track.artist['#text'];
      const album = track.album['#text'];
      const albumArt = track.image[3]['#text'];
      const trackUrl = track.url;
      const embedColor = await getCoverArtColor(albumArt);

      let userPlayCount = null;
      let userLoved = false;

      try {
        const infoUrl =
            `https://ws.audioscrobbler.com/2.0/?method=track.getInfo` +
            `&api_key=${process.env.LASTFM_API_KEY}` +
            `&format=json` +
            `&username=${encodeURIComponent(username)}` +
            `&artist=${encodeURIComponent(artist)}` +
            `&track=${encodeURIComponent(song)}`;

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
        author: { name: isPlaying ? 'Now Playing' : 'Last Played' },
        title: song,
        url: trackUrl || undefined,
        description: `**${artist}**${album ? ` - *${album}*` : ''}`,
        thumbnail: albumArt ? { url: albumArt } : null,
        footer: { text: `${footerLabel} • ${username}${playsText}${streakText}` }
      };

      message.reply({ embeds: [embed] });
    } catch (e) {
      console.log(e.response?.data || e.message);
      message.reply('Couldn\'t find that Last.fm user. Double-check the username!')
    }
  }
};
