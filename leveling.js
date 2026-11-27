// Leveling system handler

const { sql } = require('./db');

async function initDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS level_config (
            guild_id TEXT PRIMARY KEY,
            level_channel TEXT,
            xp_min INT DEFAULT 10,
            xp_max INT DEFAULT 30,
            lb_enabled BOOLEAN DEFAULT TRUE
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS user_levels (
            guild_id TEXT,
            user_id TEXT,
            xp INT DEFAULT 0,
            level INT DEFAULT 0,
            last_xp_time BIGINT DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS level_roles (
            guild_id TEXT,
            level INT,
            role_id TEXT,
            PRIMARY KEY (guild_id, level)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS vc_sessions (
            guild_id TEXT,
            user_id TEXT,
            joined_at BIGINT,
            PRIMARY KEY (guild_id, user_id)
        )
    `;
}

const CACHE_MS = 60 * 60 * 1000;
const configCache = new Map();
const levelRoleCache = new Map();

function cached(cache, guildId, load) {
    const entry = cache.get(guildId);
    if (entry && Date.now() - entry.at < CACHE_MS) return entry.value;

    const value = load();
    cache.set(guildId, { value, at: Date.now() });
    value.catch(() => cache.delete(guildId));
    return value;
}

function getConfig(guildId) {
    return cached(configCache, guildId, async () => {
        const rows = await sql`SELECT * FROM level_config WHERE guild_id = ${guildId}`;
        return rows[0] || null;
    });
}

async function setConfig(guildId, { levelChannel, xpMin, xpMax, lbEnabled }) {
    await sql`
        INSERT INTO level_config (guild_id, level_channel, xp_min, xp_max, lb_enabled)
        VALUES (${guildId}, ${levelChannel}, ${xpMin}, ${xpMax}, ${lbEnabled})
        ON CONFLICT (guild_id) DO UPDATE SET
            level_channel = ${levelChannel},
            xp_min = ${xpMin},
            xp_max = ${xpMax},
            lb_enabled = ${lbEnabled}
    `;
    configCache.delete(guildId);
}

async function setLevelChannel(guildId, channelId) {
    await sql`
        INSERT INTO level_config (guild_id, level_channel)
        VALUES (${guildId}, ${channelId})
        ON CONFLICT (guild_id) DO UPDATE SET level_channel = ${channelId}
    `;
    configCache.delete(guildId);
}

const XP_FLUSH_MS = 5 * 60 * 1000;
const XP_EVICT_MS = 60 * 60 * 1000;
const xpStates = new Map();
const xpLoading = new Map();

function xpKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function xpForNextLevel(level) {
    return 500 * (level + 1);
}

async function loadXpState(guildId, userId) {
    const key = xpKey(guildId, userId);
    const cachedState = xpStates.get(key);
    if (cachedState) return cachedState;
    if (xpLoading.has(key)) return xpLoading.get(key);

    const loading = (async () => {
        const [row] = await sql`SELECT xp, level, last_xp_time FROM user_levels WHERE guild_id = ${guildId} AND user_id = ${userId}`;
        const state = {
            guildId,
            userId,
            xp: row?.xp ?? 0,
            level: row?.level ?? 0,
            lastXpTime: Number(row?.last_xp_time ?? 0),
            dirty: false,
            touchedAt: Date.now(),
        };
        xpStates.set(key, state);
        return state;
    })().finally(() => xpLoading.delete(key));

    xpLoading.set(key, loading);
    return loading;
}

async function addXp(guildId, userId, amount, { lastXpTime } = {}) {
    const state = await loadXpState(guildId, userId);
    state.xp += amount;

    let leveledUp = false;
    if (state.xp >= xpForNextLevel(state.level)) {
        state.level += 1;
        leveledUp = true;
    }

    if (lastXpTime !== undefined) state.lastXpTime = lastXpTime;
    state.dirty = true;
    state.touchedAt = Date.now();
    return { xp: state.xp, level: state.level, lastXpTime: state.lastXpTime, leveledUp };
}

async function getXpState(guildId, userId) {
    const state = await loadXpState(guildId, userId);
    state.touchedAt = Date.now();
    return state;
}

let flushing = null;

function flushXp() {
    if (flushing) return flushing;

    flushing = (async () => {
        const dirty = [...xpStates.values()].filter(state => state.dirty);
        if (dirty.length) {
            const rows = dirty.map(state => ({
                guild_id: state.guildId,
                user_id: state.userId,
                xp: state.xp,
                level: state.level,
                last_xp_time: state.lastXpTime,
            }));
            for (const state of dirty) state.dirty = false;

            try {
                for (let i = 0; i < rows.length; i += 500) {
                    await sql`
                        INSERT INTO user_levels ${sql(rows.slice(i, i + 500), 'guild_id', 'user_id', 'xp', 'level', 'last_xp_time')}
                        ON CONFLICT (guild_id, user_id) DO UPDATE SET
                            xp = EXCLUDED.xp,
                            level = EXCLUDED.level,
                            last_xp_time = EXCLUDED.last_xp_time
                    `;
                }
            } catch (error) {
                for (const state of dirty) state.dirty = true;
                throw error;
            }
        }

        const cutoff = Date.now() - XP_EVICT_MS;
        for (const [key, state] of xpStates) {
            if (!state.dirty && state.touchedAt < cutoff) xpStates.delete(key);
        }
    })().finally(() => {
        flushing = null;
    });

    return flushing;
}

setInterval(() => {
    flushXp().catch((error) => console.error('Failed to save XP:', error));
}, XP_FLUSH_MS).unref();

async function getUser(guildId, userId) {
    const state = xpStates.get(xpKey(guildId, userId));
    if (state) return { guild_id: guildId, user_id: userId, xp: state.xp, level: state.level, last_xp_time: state.lastXpTime };

    const rows = await sql`SELECT * FROM user_levels WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    return rows[0] || null;
}

async function getLeaderboard(guildId, limit = 10) {
    await flushXp().catch((error) => console.error('Failed to save XP before leaderboard:', error));
    return await sql`
        SELECT user_id, xp, level FROM user_levels
        WHERE guild_id = ${guildId}
        ORDER BY xp DESC
        LIMIT ${limit}
    `;
}

async function setLevelRole(guildId, level, roleId) {
    await sql`
        INSERT INTO level_roles (guild_id, level, role_id)
        VALUES (${guildId}, ${level}, ${roleId})
        ON CONFLICT (guild_id, level) DO UPDATE SET role_id = ${roleId}
    `;
    levelRoleCache.delete(guildId);
}

async function removeLevelRole(guildId, level) {
    const rows = await sql`DELETE FROM level_roles WHERE guild_id = ${guildId} AND level = ${level} RETURNING role_id`;
    levelRoleCache.delete(guildId);
    return rows[0]?.role_id || null;
}

async function disableLeveling(guildId) {
    await sql`DELETE FROM level_config WHERE guild_id = ${guildId}`;
    configCache.delete(guildId);
}

async function replaceLevelRoles(guildId, roles) {
    await sql.begin(async (tx) => {
        await tx`DELETE FROM level_roles WHERE guild_id = ${guildId}`;
        if (roles.length) {
            await tx`INSERT INTO level_roles ${tx(roles.map((r) => ({ guild_id: guildId, level: r.level, role_id: r.roleId })), 'guild_id', 'level', 'role_id')}`;
        }
    });
    levelRoleCache.delete(guildId);
}

function getLevelRoles(guildId) {
    return cached(levelRoleCache, guildId, () => sql`SELECT * FROM level_roles WHERE guild_id = ${guildId} ORDER BY level ASC`);
}

module.exports = {
    initDB,
    disableLeveling,
    replaceLevelRoles,
    getConfig,
    setConfig,
    setLevelChannel,
    getUser,
    getXpState,
    addXp,
    flushXp,
    xpForNextLevel,
    getLeaderboard,
    setLevelRole,
    removeLevelRole,
    getLevelRoles,
};