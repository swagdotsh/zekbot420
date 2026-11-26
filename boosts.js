const { MessageType, PermissionFlagsBits } = require('discord.js');
const { createGuildStore } = require('./guildDataStore');
const { getMessageConfig, buildMemberMessage } = require('./welcomeStore');

const BOOST_MESSAGE_TYPES = new Set([
    MessageType.GuildBoost,
    MessageType.GuildBoostTier1,
    MessageType.GuildBoostTier2,
    MessageType.GuildBoostTier3,
]);

const DEDUPE_MS = 2 * 60 * 1000;
const FRESH_BOOST_MS = 5 * 60 * 1000;

const perkStore = createGuildStore('boostPerks.json', () => ({
    roles: [],
    channels: [],
    granted: {},
}));

const recentBoosts = new Map();

function isRecentlyAnnounced(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const last = recentBoosts.get(key);
    if (last && Date.now() - last < DEDUPE_MS) return true;
    recentBoosts.set(key, Date.now());
    setTimeout(() => {
        if (recentBoosts.get(key) && Date.now() - recentBoosts.get(key) >= DEDUPE_MS) recentBoosts.delete(key);
    }, DEDUPE_MS + 1000).unref?.();
    return false;
}

function canManageRole(guild, role) {
    const me = guild.members.me;
    return Boolean(role && !role.managed && me?.permissions.has(PermissionFlagsBits.ManageRoles)
        && role.position < me.roles.highest.position);
}

async function sendBoostMessage(guild, member) {
    const config = await getMessageConfig(guild.id, 'boost');
    if (!config.channelId) return;

    const channel = guild.channels.cache.get(config.channelId);
    if (!channel?.isTextBased()) return;
    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

    const payload = buildMemberMessage(member, config);
    if (!payload.content && !payload.embeds.length) return;
    await channel.send(payload);
}

async function grantPerks(member) {
    const perks = await perkStore.get(member.guild.id);
    if (!perks.roles.length) return [];

    const toAdd = perks.roles
        .map((id) => member.guild.roles.cache.get(id))
        .filter((role) => role && !member.roles.cache.has(role.id) && canManageRole(member.guild, role));
    if (!toAdd.length) return [];

    await member.roles.add(toAdd, 'Server booster perk');
    await perkStore.update(member.guild.id, (data) => {
        const mine = new Set(data.granted[member.id] ?? []);
        for (const role of toAdd) mine.add(role.id);
        data.granted[member.id] = [...mine];
    });
    return toAdd;
}

async function revokePerks(guild, userId, onlyRoleIds = null) {
    const perks = await perkStore.get(guild.id);
    const given = perks.granted[userId] ?? [];
    const toRemove = onlyRoleIds ? given.filter((id) => onlyRoleIds.includes(id)) : given;
    if (!toRemove.length) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
        const removable = toRemove.filter((id) => member.roles.cache.has(id) && canManageRole(guild, guild.roles.cache.get(id)));
        if (removable.length) await member.roles.remove(removable, 'Server boost ended').catch((error) => {
            console.error('[boosts] failed to remove perk roles:', error);
        });
    }

    await perkStore.update(guild.id, (data) => {
        const left = (data.granted[userId] ?? []).filter((id) => !toRemove.includes(id));
        if (left.length) data.granted[userId] = left;
        else delete data.granted[userId];
    });
}

async function announceBoost(guild, member) {
    if (isRecentlyAnnounced(guild.id, member.id)) return;

    await grantPerks(member).catch((error) => console.error('[boosts] failed to give perk roles:', error));

    setTimeout(() => {
        sendBoostMessage(guild, member).catch((error) => console.error('[boosts] failed to send boost message:', error));
    }, 3000).unref?.();
}

async function handleRawMemberUpdate(client, data) {
    const guild = client.guilds.cache.get(data.guild_id);
    if (!guild || !data.user || data.user.bot) return;

    const cached = guild.members.cache.get(data.user.id);
    const wasBoosting = cached ? Boolean(cached.premiumSinceTimestamp) : null;
    const since = data.premium_since ? Date.parse(data.premium_since) : null;

    if (since && (wasBoosting === false || (wasBoosting === null && Date.now() - since < FRESH_BOOST_MS))) {
        const member = await guild.members.fetch(data.user.id).catch(() => null);
        if (member) await announceBoost(guild, member);
        return;
    }

    if (!since && wasBoosting !== false) {
        await revokePerks(guild, data.user.id);
    }
}

async function handleBoostSystemMessage(message) {
    if (!message.guild || !BOOST_MESSAGE_TYPES.has(message.type)) return;
    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member) await announceBoost(message.guild, member);
}

async function syncPerks(client) {
    const all = await perkStore.all();
    for (const [guildId, raw] of Object.entries(all)) {
        const hasRoles = raw.roles?.length;
        const hasGranted = Object.keys(raw.granted ?? {}).length;
        if (!hasRoles && !hasGranted) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        try {
            const members = await guild.members.fetch();
            for (const userId of Object.keys(raw.granted ?? {})) {
                const member = members.get(userId);
                if (!member?.premiumSinceTimestamp) await revokePerks(guild, userId);
            }
            if (hasRoles) {
                for (const member of members.values()) {
                    if (member.premiumSinceTimestamp && !member.user.bot) await grantPerks(member);
                }
            }
        } catch (error) {
            console.error(`[boosts] failed to sync perks in ${guildId}:`, error);
        }
    }
}

function registerBoostEvents(client) {
    client.ws.on('GUILD_MEMBER_UPDATE', (data) => {
        handleRawMemberUpdate(client, data).catch((error) => console.error('[boosts] member update failed:', error));
    });
}

module.exports = {
    perkStore,
    canManageRole,
    grantPerks,
    revokePerks,
    sendBoostMessage,
    handleBoostSystemMessage,
    registerBoostEvents,
    syncPerks,
};
