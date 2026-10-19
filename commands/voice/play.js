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
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const play = require('play-dl');
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const INACTIVITY_MS = 2 * 60 * 1000;

async function probeAudio(filePath) {
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath
    ]);

    const parsed = JSON.parse(stdout || '{}');
    const audioStream = Array.isArray(parsed.streams)
      ? parsed.streams.find((s) => s.codec_type === 'audio')
      : null;

    return {
      formatName: parsed?.format?.format_name || null,
      durationSec: parsed?.format?.duration ? Number(parsed.format.duration) : null,
      bitRate: parsed?.format?.bit_rate ? Number(parsed.format.bit_rate) : null,
      codec: audioStream?.codec_name || null,
      sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
      channels: audioStream?.channels ?? null
    };
  } catch {
    return null;
  }
}

function cleanupTrack(track) {
  if (track?.sourceType === 'local' && track?.filePath && fs.existsSync(track.filePath)) {
    fs.unlinkSync(track.filePath);
  }
}

async function buildResourceForTrack(track) {
  if (track?.sourceType === 'soundcloud') {
    const stream = await play.stream(track.url);
    return createAudioResource(stream.stream, {
      inputType: stream.type || StreamType.Arbitrary
    });
  }

  return createAudioResource(track.filePath);
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
      if (latest.current || (latest.queue && latest.queue.length > 0)) return;

      const channel = latest.textChannelId ? await client.channels.fetch(latest.textChannelId).catch(() => null) : null;

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
    console.error('Failed to build/play track resource:', err);
    cleanupTrack(nextTrack);
    session.current = null;
    await playNextInQueue(client, guildId);
  }
}

module.exports = {
  name: 'play',
  async execute(message) {
    try {
      if (!message.client.voiceSessions) {
        message.client.voiceSessions = new Map();
      }

      const attachment = message.attachments.first();
      if (!attachment) return message.reply('You need to attach an audio file first. <:smirk2:1498272372539785286>');

      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) return message.reply("You're currently not in a VC. <:smirk2:1498272372539785286>");

      const me = message.guild.members.me;
      if (!me) return message.reply('Could not verify bot member state.');

      const perms = voiceChannel.permissionsFor(me);
      if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
        return message.reply('I need **Connect** and **Speak** permissions in your voice channel. <:smirk2:1498272372539785286>');
      }

      const ext = path.extname(attachment.name || '').toLowerCase() || '.mp3';
      const guildDataDir = path.join(__dirname, '..', '..', 'data', message.guild.id);
      fs.mkdirSync(guildDataDir, { recursive: true });

      const filePath = path.join(guildDataDir, `temp_${Date.now()}${ext}`);

      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      fs.writeFileSync(filePath, Buffer.from(response.data));

      const probe = await probeAudio(filePath);

      const track = {
        sourceType: 'local',
        filePath,
        startedAt: null,
        attachment: {
          name: attachment.name || path.basename(filePath),
          size: attachment.size ?? fs.statSync(filePath).size,
          contentType: attachment.contentType || null
        },
        probe,
        requestedBy: message.member?.displayName || message.author.username
      };

      let session = message.client.voiceSessions.get(message.guild.id);

      if (session?.mode === 'tts') {
        cleanupTrack(track);
        return message.reply("I'm in TTS mode right now. Use `" + process.env.PREFIX + "leave` first. <:smirk2:1498272372539785286>");
      }

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
              console.error('Loop track replay failed:', err);
              cleanupTrack(activeSession.current);
              activeSession.current = null;
              await playNextInQueue(message.client, message.guild.id);
              return;
            }
          }

          if (activeSession.loopMode === 'queue' && activeSession.current) {
            activeSession.queue.push(activeSession.current);
          } else {
            cleanupTrack(activeSession.current);
          }

          activeSession.current = null;
          await playNextInQueue(message.client, message.guild.id);
        });

        player.on('error', async (err) => {
          console.error('Audio player error:', err);

          const activeSession = message.client.voiceSessions.get(message.guild.id);
          if (!activeSession) return;

          cleanupTrack(activeSession.current);
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

      if (!session.current) {
        await playNextInQueue(message.client, message.guild.id);
        return message.reply(`Playing now: **${track.attachment.name}**`);
      }

      return message.reply(`Queued **${track.attachment.name}** at position **${session.queue.length}**.`);
    } catch (err) {
      console.error('Play command failed:', err);
      return message.reply("I couldn't play that audio. <:smirk2:1498272372539785286> #- Check console logs.");
    }
  }
};