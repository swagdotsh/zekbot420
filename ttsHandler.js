// TTS in VC handler (Edge TTS)

const postgres = require('postgres');
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: 'require' });
const { Readable } = require('stream');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { PermissionsBitField } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

const DEFAULT_VOICE = 'en-US-AriaNeural';
const MAX_TTS_CHARS = 300;
const MAX_TTS_QUEUE = 10;

const configCache = new Map(); // guildId -> { channelId }
const userVoiceCache = new Map(); // userId -> voice
let voiceListCache = null;

async function initTtsDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS tts_config (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS tts_user_voices (
            user_id TEXT PRIMARY KEY,
            voice TEXT NOT NULL
        )
    `;
}

async function getTtsConfig(guildId) {
    if (configCache.has(guildId)) return configCache.get(guildId);

    const rows = await sql`SELECT channel_id FROM tts_config WHERE guild_id = ${guildId}`;
    const config = {
        channelId: rows[0]?.channel_id || null
    };

    configCache.set(guildId, config);
    return config;
}

async function setTtsChannel(guildId, channelId) {
    await sql`
        INSERT INTO tts_config (guild_id, channel_id)
        VALUES (${guildId}, ${channelId})
        ON CONFLICT (guild_id) DO UPDATE SET channel_id = ${channelId}
    `;
    configCache.delete(guildId);
}

// voices are per user and follow them across servers
async function getUserVoice(userId) {
    if (userVoiceCache.has(userId)) return userVoiceCache.get(userId);

    const rows = await sql`SELECT voice FROM tts_user_voices WHERE user_id = ${userId}`;
    const voice = rows[0]?.voice || DEFAULT_VOICE;

    userVoiceCache.set(userId, voice);
    return voice;
}

async function setUserVoice(userId, voice) {
    if (voice === DEFAULT_VOICE) {
        await sql`DELETE FROM tts_user_voices WHERE user_id = ${userId}`;
    } else {
        await sql`
            INSERT INTO tts_user_voices (user_id, voice)
            VALUES (${userId}, ${voice})
            ON CONFLICT (user_id) DO UPDATE SET voice = ${voice}
        `;
    }
    userVoiceCache.set(userId, voice);
}

async function getVoiceList() {
    if (voiceListCache) return voiceListCache;

    const tts = new MsEdgeTTS();
    try {
        voiceListCache = await tts.getVoices();
    } finally {
        tts.close();
    }
    return voiceListCache;
}

async function findVoice(name) {
    const wanted = name.toLowerCase() === 'default' ? DEFAULT_VOICE : name;
    const voices = await getVoiceList();
    return voices.find(v => v.ShortName.toLowerCase() === wanted.toLowerCase())?.ShortName || null;
}

async function formatVoiceList(locale = 'en-US') {
    const voices = await getVoiceList();
    const matches = voices
        .filter(v => v.Locale.toLowerCase().startsWith(locale.toLowerCase()))
        .map(v => `\`${v.ShortName}\` (${v.Gender})`);

    if (!matches.length) return `No voices found for **${locale}**. Try something like \`en-GB\` or \`ja\`.`;

    let list = matches.join(', ');
    if (list.length > 1900) list = list.slice(0, 1900) + '...';
    return `**Voices for ${locale}:**\n${list}`;
}

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function synthesize(text, voice) {
    const tts = new MsEdgeTTS();
    try {
        await tts.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
        const { audioStream } = tts.toStream(escapeXml(text));

        const chunks = [];
        for await (const chunk of audioStream) chunks.push(chunk);
        return Buffer.concat(chunks);
    } finally {
        tts.close();
    }
}

// turn a discord message into something that sounds ok read out loud
function cleanTtsText(message) {
    let text = message.cleanContent || '';

    text = text
        .replace(/\|\|[\s\S]*?\|\|/g, ' spoiler ')
        .replace(/<a?:(\w+):\d+>/g, ' $1 ')
        .replace(/https?:\/\/\S+/gi, ' link ')
        .replace(/[*_~`>|#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text && message.attachments.size) text = 'sent a file';
    if (!text && message.stickers?.size) text = 'sent a sticker';
    if (text.length > MAX_TTS_CHARS) text = text.slice(0, MAX_TTS_CHARS) + '...';

    return text;
}

async function playNextTts(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session || session.mode !== 'tts' || session.speaking) return;

    const next = session.ttsQueue.shift();
    if (!next) return;

    session.speaking = true;

    try {
        const audio = await synthesize(next.text, next.voice);
        const resource = createAudioResource(Readable.from(audio), { inputType: StreamType.WebmOpus });
        session.player.play(resource);
    } catch (err) {
        console.error('TTS synthesis failed:', err);
        session.speaking = false;
        await playNextTts(client, guildId);
    }
}

// ctx is a message or an interaction, both have client/guild/channel
async function createTtsSession(ctx, voiceChannel) {
    const client = ctx.client;
    const guildId = ctx.guild.id;

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: ctx.guild.voiceAdapterCreator,
        selfDeaf: true
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    // queue/current stay empty so leave + empty-vc cleanup treat this like any other session
    const session = {
        mode: 'tts',
        connection,
        player,
        current: null,
        queue: [],
        ttsQueue: [],
        speaking: false,
        lastSpeakerId: null,
        textChannelId: ctx.channel.id,
        inactivityTimeout: null
    };

    client.voiceSessions.set(guildId, session);

    const onDone = async () => {
        const activeSession = client.voiceSessions.get(guildId);
        if (!activeSession || activeSession.mode !== 'tts') return;

        activeSession.speaking = false;
        await playNextTts(client, guildId);
    };

    player.on(AudioPlayerStatus.Idle, onDone);
    player.on('error', (err) => {
        console.error('TTS audio player error:', err);
        onDone().catch(console.error);
    });

    return session;
}

// shared by ,jointts and /tts join, returns the reply text
async function startTts(ctx, member) {
    if (!ctx.client.voiceSessions) ctx.client.voiceSessions = new Map();

    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) return "You're currently not in a VC. <:smirk2:1498272372539785286>";

    const me = ctx.guild.members.me;
    if (!me) return 'Could not verify bot member state.';

    const perms = voiceChannel.permissionsFor(me);
    if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
        return 'I need **Connect** and **Speak** permissions in your voice channel. <:smirk2:1498272372539785286>';
    }

    const session = ctx.client.voiceSessions.get(ctx.guild.id);
    if (session) {
        if (session.mode === 'tts') return 'TTS is already running. Use `' + process.env.PREFIX + 'leave` or `/tts leave` to stop it.';
        return "I'm playing music right now. Stop it with `" + process.env.PREFIX + "leave` first. <:smirk2:1498272372539785286>";
    }

    await createTtsSession(ctx, voiceChannel);

    const config = await getTtsConfig(ctx.guild.id);
    const where = config.channelId
        ? `<#${voiceChannel.id}>'s chat or <#${config.channelId}>`
        : `<#${voiceChannel.id}>'s chat`;

    return `🔊 Joined <#${voiceChannel.id}>. I'll read out messages sent in ${where} by people in the VC.`;
}

function leaveTts(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session || session.mode !== 'tts') return false;

    if (session.emptyVoiceTimeout) clearTimeout(session.emptyVoiceTimeout);
    session.ttsQueue = [];
    session.player.stop(true);
    session.connection.destroy();
    client.voiceSessions.delete(guildId);
    return true;
}

async function handleTtsMessage(message) {
    if (message.author.bot || !message.guild) return;
    if (message.content.startsWith(process.env.PREFIX)) return;

    const session = message.client.voiceSessions?.get(message.guild.id);
    if (!session || session.mode !== 'tts') return;

    const vcId = session.connection?.joinConfig?.channelId;
    if (!vcId) return;

    const config = await getTtsConfig(message.guild.id);
    const inVcChat = message.channel.id === vcId;
    const inTtsChannel = config.channelId && message.channel.id === config.channelId;
    if (!inVcChat && !inTtsChannel) return;

    // only read people who are actually in the vc
    if (message.member?.voice?.channelId !== vcId) return;

    let text = cleanTtsText(message);
    if (!text) return;

    if (session.lastSpeakerId !== message.author.id) {
        text = `${message.member?.displayName || message.author.username} says ${text}`;
        session.lastSpeakerId = message.author.id;
    }

    if (session.ttsQueue.length >= MAX_TTS_QUEUE) return;

    const voice = await getUserVoice(message.author.id);
    session.ttsQueue.push({ text, voice, authorId: message.author.id });
    await playNextTts(message.client, message.guild.id);
}

function skipTts(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session || session.mode !== 'tts') return false;

    session.player.stop(true); // fires Idle, which plays the next message
    return true;
}

module.exports = {
    DEFAULT_VOICE,
    initTtsDB,
    getTtsConfig,
    setTtsChannel,
    getUserVoice,
    setUserVoice,
    getVoiceList,
    findVoice,
    formatVoiceList,
    startTts,
    leaveTts,
    handleTtsMessage,
    skipTts
};
