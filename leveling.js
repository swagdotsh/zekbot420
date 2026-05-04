// Leveling system handler

const postgres = require('postgres');
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: 'require' });

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

async function getConfig(guildId) {
    const rows = await sql`SELECT * FROM level_config WHERE guild_id = ${guildId}`;
    return rows[0] || null;
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
}

async function setLevelChannel(guildId, channelId) {
    await sql`
        INSERT INTO level_config (guild_id, level_channel)
        VALUES (${guildId}, ${channelId})
        ON CONFLICT (guild_id) DO UPDATE SET level_channel = ${channelId}
    `;
}

async function getUser(guildId, userId) {
    const rows = await sql`SELECT * FROM user_levels WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    return rows[0] || null;
}

async function upsertUser(guildId, userId, xp, level, lastXpTime) {
    await sql`
        INSERT INTO user_levels (guild_id, user_id, xp, level, last_xp_time)
        VALUES (${guildId}, ${userId}, ${xp}, ${level}, ${lastXpTime})
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            xp = ${xp},
            level = ${level},
            last_xp_time = ${lastXpTime}
    `;
}

async function getLeaderboard(guildId, limit = 10) {
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
}

async function getLevelRoles(guildId) {
    return await sql`SELECT * FROM level_roles WHERE guild_id = ${guildId} ORDER BY level ASC`;
}

async function startVcSession(guildId, userId) {
    await sql`
        INSERT INTO vc_sessions (guild_id, user_id, joined_at)
        VALUES (${guildId}, ${userId}, ${Date.now()})
        ON CONFLICT (guild_id, user_id) DO UPDATE SET joined_at = ${Date.now()}
    `;
}

async function endVcSession(guildId, userId) {
    const rows = await sql`SELECT joined_at FROM vc_sessions WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    await sql`DELETE FROM vc_sessions WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    return rows[0]?.joined_at || null;
}

async function getAllVcSessions() {
    return await sql`SELECT * FROM vc_sessions`;
}

module.exports = {
    initDB,
    getConfig,
    setConfig,
    setLevelChannel,
    getUser,
    upsertUser,
    getLeaderboard,
    setLevelRole,
    getLevelRoles,
    startVcSession,
    endVcSession,
    getAllVcSessions
};