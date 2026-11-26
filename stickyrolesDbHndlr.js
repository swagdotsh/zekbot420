const { sql } = require('./db');

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

const configCache = new Map();

function cachedGuild(guildId) {
    if (!configCache.has(guildId)) configCache.set(guildId, {});
    return configCache.get(guildId);
}

function remember(entry, field, loader) {
    if (!entry[field]) {
        entry[field] = loader();
        entry[field].catch(() => { delete entry[field]; });
    }
    return entry[field];
}

async function setStickyRolesEnabled(guildId, enabled) {
    configCache.delete(guildId);
    await sql`
        INSERT INTO sticky_roles_config (guild_id, enabled)
        VALUES (${guildId}, ${enabled})
        ON CONFLICT (guild_id) DO UPDATE SET enabled = ${enabled}
    `;
}

function getStickyRolesEnabled(guildId) {
    return remember(cachedGuild(guildId), 'enabled', async () => {
        const rows = await sql`SELECT enabled FROM sticky_roles_config WHERE guild_id = ${guildId}`;
        return rows[0]?.enabled || false;
    });
}

async function addStickyRole(guildId, roleId) {
    configCache.delete(guildId);
    await sql`
        INSERT INTO sticky_roles (guild_id, role_id)
        VALUES (${guildId}, ${roleId})
        ON CONFLICT DO NOTHING
    `;
}

async function removeStickyRole(guildId, roleId) {
    configCache.delete(guildId);
    await sql`DELETE FROM sticky_roles WHERE guild_id = ${guildId} AND role_id = ${roleId}`;
}

function getStickyRoles(guildId) {
    return remember(cachedGuild(guildId), 'roles', () => sql`SELECT role_id FROM sticky_roles WHERE guild_id = ${guildId}`);
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