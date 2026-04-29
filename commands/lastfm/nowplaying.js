const axios = require('axios');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

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

    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user=${username}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`;

    try {
      const { data } = await axios.get(url);
      const track = data.recenttracks.track[0];

      if (!track) return message.reply(`No recent tracks found for **${username}**.`);

      const isPlaying = track['@attr']?.nowplaying === 'true';
      const song = track.name;
      const artist = track.artist['#text'];
      const album = track.album['#text'];
      const albumArt = track.image[3]['#text'];
      const trackUrl = track.url;

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

      const embed = {
        color: 0xd51007,
        author: { name: isPlaying ? '🎵 Now Playing' : '⏮ Last Played' },
        title: song,
        url: trackUrl || undefined,
        description: `by **${artist}**${album ? ` • *${album}*` : ''}`,
        thumbnail: albumArt ? { url: albumArt } : null,
        footer: { text: `${footerLabel} • ${username}${playsText}` }
      };

      message.reply({ embeds: [embed] });
    } catch (e) {
      console.log(e.response?.data || e.message);
      message.reply('Couldn\'t find that Last.fm user. Double-check the username!')
    }
  }
};