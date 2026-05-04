const postgres = require('postgres');
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: 'require' });

async function initJailDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS jail_config (
            guild_id TEXT PRIMARY KEY,
            jail_channel_id TEXT,
            jail_role_id TEXT
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS jailed_users (
            guild_id TEXT,
            user_id TEXT,
            saved_roles TEXT,
            jailed_at BIGINT,
            expires_at BIGINT,
            PRIMARY KEY (guild_id, user_id)
        )
    `;
}

async function getJailConfig(guildId) {
    const rows = await sql`SELECT * FROM jail_config WHERE guild_id = ${guildId}`;
    return rows[0] || null;
}

async function setJailConfig(guildId, jailChannelId, jailRoleId) {
    await sql`
        INSERT INTO jail_config (guild_id, jail_channel_id, jail_role_id)
        VALUES (${guildId}, ${jailChannelId}, ${jailRoleId})
        ON CONFLICT (guild_id) DO UPDATE SET
            jail_channel_id = ${jailChannelId},
            jail_role_id = ${jailRoleId}
    `;
}

async function deleteJailConfig(guildId) {
    await sql`DELETE FROM jail_config WHERE guild_id = ${guildId}`;
}

async function jailUser(guildId, userId, savedRoles, expiresAt) {
    await sql`
        INSERT INTO jailed_users (guild_id, user_id, saved_roles, jailed_at, expires_at)
        VALUES (${guildId}, ${userId}, ${savedRoles}, ${Date.now()}, ${expiresAt})
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            saved_roles = ${savedRoles},
            jailed_at = ${Date.now()},
            expires_at = ${expiresAt}
    `;
}

async function getJailedUser(guildId, userId) {
    const rows = await sql`SELECT * FROM jailed_users WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    return rows[0] || null;
}

async function unjailUser(guildId, userId) {
    const rows = await sql`SELECT saved_roles FROM jailed_users WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    await sql`DELETE FROM jailed_users WHERE guild_id = ${guildId} AND user_id = ${userId}`;
    return rows[0]?.saved_roles || null;
}

async function getExpiredJails() {
    return await sql`SELECT * FROM jailed_users WHERE expires_at IS NOT NULL AND expires_at <= ${Date.now()}`;
}

module.exports = { initJailDB, getJailConfig, setJailConfig, deleteJailConfig, jailUser, getJailedUser, unjailUser, getExpiredJails };