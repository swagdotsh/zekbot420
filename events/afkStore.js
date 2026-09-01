const afkUsers = new Map();

function getAfkKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function setAfk(guildId, userId, data) {
    afkUsers.set(getAfkKey(guildId, userId), data);
}

function getAfk(guildId, userId) {
    return afkUsers.get(getAfkKey(guildId, userId));
}

function removeAfk(guildId, userId) {
    return afkUsers.delete(getAfkKey(guildId, userId));
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
    setAfk,
    getAfk,
    removeAfk,
    hasAfk,
    handleAfkMessage,
};