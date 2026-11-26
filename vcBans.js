const { PermissionFlagsBits } = require('discord.js');
const { createGuildStore } = require('./guildDataStore');
const { createDueScheduler, notifyDue } = require('./dueScheduler');

const SCHEDULER = 'vc-ban-expiry';
const store = createGuildStore('vcBans.json', () => ({ bans: {} }));

function activeBan(config, userId) {
    const ban = config.bans[userId];
    if (!ban) return null;
    if (ban.until && ban.until <= Date.now()) return null;
    return ban;
}

async function getVcBan(guildId, userId) {
    return activeBan(await store.get(guildId), userId);
}

async function addVcBan(guildId, userId, { by, reason, until }) {
    await store.update(guildId, (data) => {
        data.bans[userId] = { by, reason: reason ?? null, at: Date.now(), until: until ?? null };
    });
    if (until) notifyDue(SCHEDULER, until);
}

async function removeVcBan(guildId, userId) {
    let existed = false;
    await store.update(guildId, (data) => {
        existed = Boolean(activeBan(data, userId));
        delete data.bans[userId];
    });
    return existed;
}

async function listVcBans(guildId) {
    const config = await store.get(guildId);
    return Object.entries(config.bans)
        .filter(([userId]) => activeBan(config, userId))
        .map(([userId, ban]) => ({ userId, ...ban }));
}

async function enforce(member, ban) {
    if (!member.voice?.channelId) return false;
    if (!member.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers)) return false;
    await member.voice.disconnect('VC banned');

    const until = ban.until ? ` until <t:${Math.floor(ban.until / 1000)}:f>` : '';
    const reason = ban.reason ? `\nReason: ${ban.reason}` : '';
    await member.send(`🔇 You're banned from voice channels in **${member.guild.name}**${until}.${reason}`).catch(() => {});
    return true;
}

async function handleVcBanVoiceState(oldState, newState) {
    if (!newState.channelId || oldState.channelId === newState.channelId) return;
    const member = newState.member;
    if (!member || member.user.bot) return;

    const ban = await getVcBan(newState.guild.id, member.id);
    if (ban) await enforce(member, ban);
}

async function runDue() {
    const now = Date.now();
    for (const [guildId, data] of Object.entries(await store.all())) {
        const expired = Object.entries(data.bans ?? {}).filter(([, ban]) => ban.until && ban.until <= now);
        if (!expired.length) continue;
        await store.update(guildId, (current) => {
            for (const [userId, ban] of expired) {
                if (current.bans[userId]?.until === ban.until) delete current.bans[userId];
            }
        });
    }
    return false;
}

async function getNextDue() {
    const now = Date.now();
    let next = null;
    for (const data of Object.values(await store.all())) {
        for (const ban of Object.values(data.bans ?? {})) {
            if (ban.until && ban.until > now && (next === null || ban.until < next)) next = ban.until;
        }
    }
    return next;
}

function startVcBanLoop() {
    createDueScheduler(SCHEDULER, { runDue, getNextDue }).start();
}

module.exports = { addVcBan, removeVcBan, getVcBan, listVcBans, enforce, handleVcBanVoiceState, startVcBanLoop };
