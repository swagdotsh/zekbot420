const { getOrCreateSession, playNext, cleanupTrack } = require('../../musicPlayer');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

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

      if (!session) session = await getOrCreateSession(message, voiceChannel);

      session.textChannelId = message.channel.id;

      if (session.inactivityTimeout) {
        clearTimeout(session.inactivityTimeout);
        session.inactivityTimeout = null;
      }

      session.queue.push(track);

      if (!session.current) {
        await playNext(message.client, message.guild.id);
        return message.reply(`Playing now: **${track.attachment.name}**`);
      }

      return message.reply(`Queued **${track.attachment.name}** at position **${session.queue.length}**.`);
    } catch (err) {
      console.error('Play command failed:', err);
      return message.reply("I couldn't play that audio. <:smirk2:1498272372539785286> #- Check console logs.");
    }
  }
};