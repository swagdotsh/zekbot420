const { buildResource, prepareTrack } = require('../../musicPlayer');

function getTrackName(track) {
  if (!track) return 'current track';
  if (track.title && track.uploader) return ""+track.title+" - "+track.uploader;
  return track.attachment?.name || track.title || 'current track';
}

module.exports = {
  name: 'restart',
  aliases: ['replay', 'rstart'],
  async execute(message) {
    const session = message.client.voiceSessions?.get(message.guild.id);
    if (!session || !session.current) {
      return message.reply('Nothing is currently playing to restart.');
    }

    try {
      if (!(await prepareTrack(session.current))) return message.reply('Could not restart the current track.');
      const resource = buildResource(session.current);
      session.current.startedAt = Date.now();
      session.player.play(resource);

      return message.reply(`🔁 Restarted **${getTrackName(session.current)}**`);
    } catch (err) {
      console.error('restart command error:', err);

      if (err?.code === 'ENOENT') {
        return message.reply('Could not find `yt-dlp` or `ffmpeg`. Install them or set `YTDLP_PATH` / `FFMPEG_PATH` in your `.env`.');
      }

      return message.reply('Failed to restart the current track.');
    }
  }
};