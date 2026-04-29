// same as play.js but for soundcloud.
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState
} = require('@discordjs/voice');
const { PermissionsBitField } = require('discord.js');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const INACTIVITY_MS = 2 * 60 * 1000;
const MAX_TRACK_DURATION_SEC = 7 * 60;

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Unknown';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return ""+minutes+":"+String(secs).padStart(2, '0');
}

function isUrl(input) {
  return /^https?:\/\//i.test(input);
}

function getYtDlpTarget(input) {
  if (isUrl(input)) return input;

  return `scsearch1:${input}`;
}

async function getTrackInfo(input) {
  const target = getYtDlpTarget(input);

  const { stdout } = await execFileAsync(YTDLP_BIN, [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    target
  ], {
    maxBuffer: 1024 * 1024 * 10
  });

  const firstJsonLine = stdout
    .split('\n')
    .map(function(line) { return line.trim() })
    .find(Boolean);

  if (!firstJsonLine) return null;

  const info = JSON.parse(firstJsonLine);

  return {
    sourceType: 'soundcloud',
    title: info.title || 'Unknown title',
    uploader: info.uploader || info.channel || 'Unknown artist',
    url: info.webpage_url || info.original_url || target,
    duration: Number.isFinite(info.duration) ? info.duration : null,
    durationRaw: formatDuration(info.duration),
    thumbnail: info.thumbnail || null,
    requestedBy: null,
    startedAt: null
  };
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

  ytDlp.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(`yt-dlp stderr: ${text}`);
  });

  ytDlp.on('error', (err) => {
    console.error('Failed to start yt-dlp:', err);
  });

  const ffmpeg = spawn(FFMPEG_BIN, [
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  ytDlp.stdout.pipe(ffmpeg.stdin);

  ffmpeg.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(`ffmpeg stderr: ${text}`);
  });

  ffmpeg.on('error', (err) => {
    console.error('Failed to start ffmpeg:', err);
  });

  return ffmpeg.stdout;
}

async function buildResourceForTrack(track) {
  const stream = createYtDlpFfmpegStream(track);

  return createAudioResource(stream, {
    inputType: StreamType.Raw
  });
}

async function playNextInQueue(client, guildId) {
  const session = client.voiceSessions?.get(guildId);
  if (!session) return;

  const nextTrack = session.queue.shift();

  if (!nextTrack) {
    if (session.inactivityTimeout) clearTimeout(session.inactivityTimeout);

    session.inactivityTimeout = setTimeout(async () => {
      const latest = client.voiceSessions?.get(guildId);
      if (!latest) return;
      if (latest.current || latest.queue.length > 0) return;

      const channel = latest.textChannelId
        ? await client.channels.fetch(latest.textChannelId).catch(() => null)
        : null;

      if (latest.connection) latest.connection.destroy();
      client.voiceSessions.delete(guildId);

      if (channel?.isTextBased()) {
        await channel.send('Left voice channel after 2 minutes of inactivity.');
      }
    }, INACTIVITY_MS);

    return;
  }

  if (session.inactivityTimeout) {
    clearTimeout(session.inactivityTimeout);
    session.inactivityTimeout = null;
  }

  try {
    nextTrack.startedAt = Date.now();
    session.current = nextTrack;

    const resource = await buildResourceForTrack(nextTrack);
    session.player.play(resource);
  } catch (err) {
    console.error('Failed to build/play SoundCloud resource:', err);
    session.current = null;
    await playNextInQueue(client, guildId);
  }
}

module.exports = {
  name: 'sc',
  aliases: ['soundcloud'],

  async execute(message, args) {
    try {
      if (!message.client.voiceSessions) {
        message.client.voiceSessions = new Map();
      }

      const query = args.join(' ').trim();
      if (!query) {
        return message.reply('Usage: `,sc <soundcloud url or search>`');
      }

      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply("You're currently not in a VC. <:smirk2:1498272372539785286>");
      }

      const me = message.guild.members.me;
      if (!me) {
        return message.reply('Could not verify bot member state.');
      }

      const perms = voiceChannel.permissionsFor(me);
      if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
        return message.reply('I need **Connect** and **Speak** permissions in your voice channel. <:smirk2:1498272372539785286>');
      }

      const loadingMessage = await message.reply('Searching SoundCloud...');

      const track = await getTrackInfo(query);
      if (!track?.url) {
        return loadingMessage.edit('No SoundCloud track found.');
      }

      if (Number.isFinite(track.duration) && track.duration > MAX_TRACK_DURATION_SEC) {
        return loadingMessage.edit(`That track is too long. Max length is **${formatDuration(MAX_TRACK_DURATION_SEC)}**, but this one is **${track.durationRaw}**.`);
      }

      track.requestedBy = message.member?.displayName || message.author.username;

      let session = message.client.voiceSessions.get(message.guild.id);

      if (!session) {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: true
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 30000);

        const player = createAudioPlayer();
        connection.subscribe(player);

        session = {
          connection,
          player,
          current: null,
          queue: [],
          textChannelId: message.channel.id,
          inactivityTimeout: null,
          loopMode: 'off',
          supportsSc: true
        };

        message.client.voiceSessions.set(message.guild.id, session);

        player.on(AudioPlayerStatus.Idle, async () => {
          const activeSession = message.client.voiceSessions.get(message.guild.id);
          if (!activeSession) return;

          if (activeSession.loopMode === 'track' && activeSession.current) {
            try {
              activeSession.current.startedAt = Date.now();

              const resource = await buildResourceForTrack(activeSession.current);
              activeSession.player.play(resource);
              return;
            } catch (err) {
              console.error('SoundCloud loop replay failed:', err);
              activeSession.current = null;
              await playNextInQueue(message.client, message.guild.id);
              return;
            }
          }

          if (activeSession.loopMode === 'queue' && activeSession.current) {
            activeSession.queue.push(activeSession.current);
          }

          activeSession.current = null;
          await playNextInQueue(message.client, message.guild.id);
        });

        player.on('error', async (err) => {
          console.error('SoundCloud audio player error:', err);

          const activeSession = message.client.voiceSessions.get(message.guild.id);
          if (!activeSession) return;

          activeSession.current = null;
          await playNextInQueue(message.client, message.guild.id);
        });
      }

      session.textChannelId = message.channel.id;

      if (session.inactivityTimeout) {
        clearTimeout(session.inactivityTimeout);
        session.inactivityTimeout = null;
      }

      session.queue.push(track);

      const displayName = `${track.title} - ${track.uploader}`;
      const duration = track.durationRaw !== 'Unknown' ? ` \`${track.durationRaw}\`` : '';

      if (!session.current) {
        await playNextInQueue(message.client, message.guild.id);
        return loadingMessage.edit(`Playing now: **${displayName}**${duration}`);
      }

      return loadingMessage.edit(`Queued **${displayName}**${duration} at position **${session.queue.length}**.`);
    } catch (err) {
      console.error('SoundCloud command failed:', err);

      if (err?.code === 'ENOENT') {
        return message.reply('Could not find `yt-dlp` or `ffmpeg`. Install them or set `YTDLP_PATH` / `FFMPEG_PATH` in your `.env`.');
      }

      return message.reply("I couldn't play that SoundCloud track. <:smirk2:1498272372539785286> #- Check console logs.");
    }
  }
};