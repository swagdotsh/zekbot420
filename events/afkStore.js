const { sql } = require('../db');

const afkUsers = new Map();

function getAfkKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function persist(promise) {
    promise.catch((error) => console.error('Failed to save AFK status:', error));
}

async function initAfkDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS afk_status (
            guild_id TEXT,
            user_id TEXT,
            reason TEXT NOT NULL,
            started_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `;

    const rows = await sql`SELECT guild_id, user_id, reason, started_at FROM afk_status`;
    for (const row of rows) {
        afkUsers.set(getAfkKey(row.guild_id, row.user_id), { reason: row.reason, startedAt: Number(row.started_at) });
    }
}

function setAfk(guildId, userId, data) {
    afkUsers.set(getAfkKey(guildId, userId), data);
    persist(sql`
        INSERT INTO afk_status (guild_id, user_id, reason, started_at)
        VALUES (${guildId}, ${userId}, ${data.reason}, ${data.startedAt})
        ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, started_at = EXCLUDED.started_at
    `);
}

function getAfk(guildId, userId) {
    return afkUsers.get(getAfkKey(guildId, userId));
}

function removeAfk(guildId, userId) {
    const existed = afkUsers.delete(getAfkKey(guildId, userId));
    if (existed) persist(sql`DELETE FROM afk_status WHERE guild_id = ${guildId} AND user_id = ${userId}`);
    return existed;
}

function hasAfk(guildId, userId) {
    return afkUsers.has(getAfkKey(guildId, userId));
}

function formatAfkDuration(startedAt) {
    const totalSeconds = Math.floor((Date.now() - startedAt) / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

async function handleAfkMessage(message) {
    if (!message.guild || message.author.bot) return;

    const prefix = process.env.PREFIX || ',';
    const isAfkCommand = message.content
        .trim()
        .toLowerCase()
        .startsWith(`${prefix}afk`);

    const mentionedAfkUsers = new Map();

    for (const user of message.mentions.users.values()) {
        if (user.bot || user.id === message.author.id) continue;

        const afkData = getAfk(message.guild.id, user.id);
        if (afkData) mentionedAfkUsers.set(user.id, { user, afkData });
    }

    if (message.reference?.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);

            if (
                repliedMessage?.author &&
                !repliedMessage.author.bot &&
                repliedMessage.author.id !== message.author.id
            ) {
                const afkData = getAfk(message.guild.id, repliedMessage.author.id);

                if (afkData) {
                    mentionedAfkUsers.set(repliedMessage.author.id, {
                        user: repliedMessage.author,
                        afkData,
                    });
                }
            }
        } catch (error) {
            console.error('Failed to check replied message for AFK:', error);
        }
    }

    for (const { user, afkData } of mentionedAfkUsers.values()) {
        const unixTimestamp = Math.floor(afkData.startedAt / 1000);

        await message.reply({
            content: `**${user.username}** is AFK: ${afkData.reason}. AFK Since: <t:${unixTimestamp}:R> - <t:${unixTimestamp}:f>`,
            allowedMentions: {
                parse: [],
                repliedUser: false,
            },
        });
    }

    if (!isAfkCommand && hasAfk(message.guild.id, message.author.id)) {
        removeAfk(message.guild.id, message.author.id);

        await message.reply({
            content: `Welcome back, **${message.author.username}**. Your AFK status has been removed.`,
            allowedMentions: {
                repliedUser: false,
            },
        });
    }
}

module.exports = {
    initAfkDB,
    setAfk,
    getAfk,
    removeAfk,
    hasAfk,
    handleAfkMessage,
};