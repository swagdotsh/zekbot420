const { PermissionFlagsBits } = require('discord.js');
const { createGuildStore } = require('./guildDataStore');
const { createDueScheduler, notifyDue } = require('./dueScheduler');
const { ok } = require('./ui');

const SCHEDULER = 'bump-reminders';

const BUILT_IN_BOTS = {
    '302050872383242240': { name: 'DISBOARD', cooldownMinutes: 120, success: /bump done/i, command: '/bump' },
};

const SUCCESS_WORDS = /\b(bump(ed)?\s*(done|successful(ly)?|success|complete)|successfully\s+bumped|thanks?\s+for\s+bumping|bumped!?)\b/i;
const FAILURE_WORDS = /\b(wait|cooldown|again in|try again|please wait|too soon|cannot|can't|already)\b/i;

const store = createGuildStore('bumpReminders.json', () => ({
    enabled: false,
    channelId: null,
    roleId: null,
    message: null,
    bots: {},
    pending: {},
}));

let client = null;

function botInfo(config, botId) {
    return BUILT_IN_BOTS[botId] ?? (config.bots[botId] ? { ...config.bots[botId], command: '/bump' } : null);
}

function messageText(message) {
    return [
        message.content,
        ...message.embeds.flatMap((embed) => [embed.title, embed.description, ...(embed.fields ?? []).map((f) => `${f.name} ${f.value}`)]),
    ].filter(Boolean).join('\n');
}

function isSuccessfulBump(message, bot) {
    const text = messageText(message);
    if (bot.success) return bot.success.test(text);

    const commandName = message.interaction?.commandName ?? message.interactionMetadata?.name;
    if (commandName && !/bump/i.test(commandName)) return false;
    return SUCCESS_WORDS.test(text) && !FAILURE_WORDS.test(text);
}

const seen = new Set();

async function handleBumpMessage(message) {
    if (!message.guild || !message.author?.bot) return;
    if (seen.has(message.id)) return;

    const config = await store.get(message.guild.id);
    if (!config.enabled) return;

    const bot = botInfo(config, message.author.id);
    if (!bot || !isSuccessfulBump(message, bot)) return;

    seen.add(message.id);
    setTimeout(() => seen.delete(message.id), 10 * 60 * 1000).unref?.();

    const bumperId = message.interactionMetadata?.user?.id ?? message.interaction?.user?.id ?? null;
    const dueAt = Date.now() + bot.cooldownMinutes * 60 * 1000;

    await store.update(message.guild.id, (data) => {
        data.pending[message.author.id] = { dueAt, channelId: message.channel.id, bumperId };
    });
    notifyDue(SCHEDULER, dueAt);

    const thanks = bumperId ? `Thanks for bumping, <@${bumperId}>!` : 'Thanks for bumping!';
    await message.channel.send({
        content: ok(`${thanks} I'll remind you to bump on ${bot.name} again <t:${Math.floor(dueAt / 1000)}:R>.`),
        allowedMentions: { users: bumperId ? [bumperId] : [] },
    }).catch(() => {});
}

async function sendReminder(guildId, botId, entry, config) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return true;

    const channel = guild.channels.cache.get(config.channelId ?? entry.channelId);
    const perms = channel?.permissionsFor(guild.members.me);
    if (!channel?.isTextBased() || !perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return true;

    const bot = botInfo(config, botId) ?? { name: 'the listing bot', command: '/bump' };
    const ping = config.roleId ? `<@&${config.roleId}> ` : '';
    const text = config.message
        ? config.message.replace(/\{bot\}/gi, bot.name).replace(/\{command\}/gi, bot.command)
        : `It's time to bump the server on **${bot.name}**! Use \`${bot.command}\`.`;

    await channel.send({
        content: `🔔 ${ping}${text}`,
        allowedMentions: { roles: config.roleId ? [config.roleId] : [] },
    });
    return true;
}

async function runDue() {
    const now = Date.now();
    const all = await store.all();
    let hadFailures = false;

    for (const [guildId, raw] of Object.entries(all)) {
        const config = await store.get(guildId);
        for (const [botId, entry] of Object.entries(raw.pending ?? {})) {
            if (entry.dueAt > now) continue;
            try {
                if (config.enabled) await sendReminder(guildId, botId, entry, config);
            } catch (error) {
                console.error('[bumpReminders] failed to send reminder:', error);
                hadFailures = true;
            }
            await store.update(guildId, (data) => {
                if (data.pending[botId]?.dueAt === entry.dueAt) delete data.pending[botId];
            });
        }
    }
    return hadFailures;
}

async function getNextDue() {
    const now = Date.now();
    let next = null;
    for (const data of Object.values(await store.all())) {
        for (const entry of Object.values(data.pending ?? {})) {
            if (entry.dueAt > now && (next === null || entry.dueAt < next)) next = entry.dueAt;
        }
    }
    return next;
}

function startBumpReminderLoop(discordClient) {
    client = discordClient;
    createDueScheduler(SCHEDULER, { runDue, getNextDue }).start();
}

module.exports = { store, BUILT_IN_BOTS, handleBumpMessage, startBumpReminderLoop, botInfo };
