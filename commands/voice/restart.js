const { createAudioResource, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';

function getTrackName(track) {
  if (!track) return 'current track';
  if (track.title && track.uploader) return ""+track.title+" - "+track.uploader;
  return track.attachment?.name || track.title || 'current track';
}

function createYtDlpFfmpegStream(track) {
  const ytDlp = spawn(YTDLP_BIN, [
    '-f',
    'bestaudio/best',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '-o',
    '-',
    track.url
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const ffmpeg = spawn(FFMPEG_BIN, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    'pipe:1'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  ytDlp.stdout.pipe(ffmpeg.stdin);

  ytDlp.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error("yt-dlp stderr: "+text);
  });

  ffmpeg.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error("ffmpeg stderr: "+text);
  });

  ytDlp.on('error', (err) => {
    console.error('Failed to start yt-dlp:', err);
    ffmpeg.stdin.destroy();
  });

  ffmpeg.on('error', (err) => {
    console.error('Failed to start ffmpeg:', err);
    ytDlp.kill('SIGKILL');
  });

  ffmpeg.stdout.on('close', () => {
    ytDlp.kill('SIGKILL');
  });

  return ffmpeg.stdout;
}

function createResourceForTrack(track) {
  if (track?.sourceType === 'soundcloud' || track?.sourceType === 'youtube') {
    return createAudioResource(createYtDlpFfmpegStream(track), {
      inputType: StreamType.Raw
    });
  }

  return createAudioResource(track.filePath);
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
      const resource = createAudioResource(session.current.filePath);
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