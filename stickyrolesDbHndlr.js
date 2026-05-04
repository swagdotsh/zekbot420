const postgres = require('postgres');
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: 'require' });

async function initStickyRoleDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS sticky_roles_config (
            guild_id TEXT PRIMARY KEY,
            enabled BOOLEAN DEFAULT FALSE
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS sticky_roles (
            guild_id TEXT,
            role_id TEXT,
            PRIMARY KEY (guild_id, role_id)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS user_sticky_roles (
            guild_id TEXT,
            user_id TEXT,
            role_id TEXT,
            PRIMARY KEY (guild_id, user_id, role_id)
        )
    `;
}

async function setStickyRolesEnabled(guildId, enabled) {
    await sql`
        INSERT INTO sticky_roles_config (guild_id, enabled)
        VALUES (${guildId}, ${enabled})
        ON CONFLICT (guild_id) DO UPDATE SET enabled = ${enabled}
    `;
}

async function getStickyRolesEnabled(guildId) {
    const rows = await sql`SELECT enabled FROM sticky_roles_config WHERE guild_id = ${guildId}`;
    return rows[0]?.enabled || false;
}

async function addStickyRole(guildId, roleId) {
    await sql`
        INSERT INTO sticky_roles (guild_id, role_id)
        VALUES (${guildId}, ${roleId})
        ON CONFLICT DO NOTHING
    `;
}

async function removeStickyRole(guildId, roleId) {
    await sql`DELETE FROM sticky_roles WHERE guild_id = ${guildId} AND role_id = ${roleId}`;
}

async function getStickyRoles(guildId) {
    return await sql`SELECT role_id FROM sticky_roles WHERE guild_id = ${guildId}`;
}

async function addUserStickyRole(guildId, userId, roleId) {
    await sql`
        INSERT INTO user_sticky_roles (guild_id, user_id, role_id)
        VALUES (${guildId}, ${userId}, ${roleId})
        ON CONFLICT DO NOTHING
    `;
}

async function removeUserStickyRole(guildId, userId, roleId) {
    await sql`DELETE FROM user_sticky_roles WHERE guild_id = ${guildId} AND user_id = ${userId} AND role_id = ${roleId}`;
}

async function getUserStickyRoles(guildId, userId) {
    return await sql`SELECT role_id FROM user_sticky_roles WHERE guild_id = ${guildId} AND user_id = ${userId}`;
}

module.exports = {
    initStickyRoleDB,
    setStickyRolesEnabled,
    getStickyRolesEnabled,
    addStickyRole,
    removeStickyRole,
    getStickyRoles,
    addUserStickyRole,
    removeUserStickyRole,
    getUserStickyRoles
};