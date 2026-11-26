const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { createGuildStore } = require('./guildDataStore');
const { readJson } = require('./jsonStore');
const { DATA_DIR } = require('./paths');

const DAY_MS = 24 * 60 * 60 * 1000;
const MILESTONES = { 7: '🎉 One whole week!', 30: '🏆 A full month!', 50: '💎 Fifty days!', 100: '👑 One hundred days!', 365: '🌟 A whole year!' };

const store = createGuildStore('streaks.json', () => ({
    channelId: null,
    minDays: 2,
    users: {},
}));

const TIMEZONES_PATH = path.join(DATA_DIR, 'userTimezones.json');
const TZ_REFRESH_MS = 5 * 60 * 1000;
let timezones = {};
let timezonesLoadedAt = 0;
let timezonesLoading = null;

async function offsetMinutes(userId) {
    if (Date.now() - timezonesLoadedAt > TZ_REFRESH_MS) {
        timezonesLoading ??= readJson(TIMEZONES_PATH, {})
            .then((data) => { timezones = data && typeof data === 'object' ? data : {}; })
            .catch(() => {})
            .finally(() => { timezonesLoadedAt = Date.now(); timezonesLoading = null; });
        await timezonesLoading;
    }
    const offset = Number(timezones[userId]?.timezoneOffsetMinutes);
    return Number.isFinite(offset) ? offset : 0;
}

async function today(userId, now = Date.now()) {
    return Math.floor((now + (await offsetMinutes(userId)) * 60 * 1000) / DAY_MS);
}

async function currentStreak(userId, entry) {
    if (!entry) return 0;
    return entry.lastDay >= (await today(userId)) - 1 ? entry.count : 0;
}

function streakMessage(member, count) {
    const flames = count >= 100 ? '🔥🔥🔥' : count >= 30 ? '🔥🔥' : '🔥';
    const milestone = MILESTONES[count] ? ` ${MILESTONES[count]}` : '';
    return `${flames} ${member} is on a **${count} day** streak!${milestone}`;
}

async function handleStreakMessage(message) {
    if (!message.guild || message.author.bot || message.system) return;

    const config = await store.get(message.guild.id);
    if (!config.channelId) return;

    const userId = message.author.id;
    const day = await today(userId, message.createdTimestamp);
    if (config.users[userId]?.lastDay === day) return;

    let count = null;
    await store.update(message.guild.id, (data) => {
        const entry = data.users[userId];
        if (entry?.lastDay === day) return;
        const next = entry?.lastDay === day - 1 ? entry.count + 1 : 1;
        data.users[userId] = { count: next, best: Math.max(next, entry?.best ?? 0), lastDay: day };
        count = next;
    });
    if (count === null || count < config.minDays) return;

    const channel = message.guild.channels.cache.get(config.channelId);
    const perms = channel?.permissionsFor(message.guild.members.me);
    if (!channel?.isTextBased() || !perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

    await channel.send({ content: streakMessage(message.member ?? message.author, count), allowedMentions: { parse: [] } });
}

async function leaderboard(guildId, limit = 10) {
    const config = await store.get(guildId);
    const rows = [];
    for (const [userId, entry] of Object.entries(config.users)) {
        const count = await currentStreak(userId, entry);
        if (count > 0) rows.push({ userId, count, best: entry.best });
    }
    return rows.sort((a, b) => b.count - a.count || b.best - a.best).slice(0, limit);
}

module.exports = { store, today, currentStreak, handleStreakMessage, leaderboard, streakMessage };
