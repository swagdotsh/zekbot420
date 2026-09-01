const fs = require('fs/promises');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_CONFIG = {
    channelId: null,
    threshold: 3,
    allowSelf: false,
    reactionEmoji: { id: null, name: '⭐' },
    entries: {},
};
const guildQueues = new Map();

function configPath(guildId) {
    return path.join(DATA_DIR, String(guildId), 'starboard.json');
}

function normalizeConfig(value) {
    const configuredEmoji = value?.reactionEmoji;
    return {
        channelId: value?.channelId ?? null,
        threshold: Number.isInteger(value?.threshold) && value.threshold > 0
            ? value.threshold
            : DEFAULT_CONFIG.threshold,
        allowSelf: value?.allowSelf === true,
        reactionEmoji: configuredEmoji && typeof configuredEmoji === 'object'
            ? {
                id: configuredEmoji.id ? String(configuredEmoji.id) : null,
                name: String(configuredEmoji.name ?? '⭐'),
            }
            : { ...DEFAULT_CONFIG.reactionEmoji },
        entries: value?.entries && typeof value.entries === 'object' ? value.entries : {},
    };
}

function parseReactionEmoji(input) {
    const raw = String(input ?? '').trim();
    const customEmoji = raw.match(/^<a?:[\w~]+:(\d+)>$/);
    if (customEmoji) {
        const name = raw.match(/^<a?:([\w~]+):\d+>$/)?.[1] ?? 'custom emoji';
        return { id: customEmoji[1], name };
    }

    if (!raw || raw.length > 64) return null;
    return { id: null, name: raw };
}

function reactionMatches(reaction, configuredEmoji) {
    if (configuredEmoji.id) return reaction.emoji.id === configuredEmoji.id;
    return reaction.emoji.id === null && reaction.emoji.name === configuredEmoji.name;
}

function starboardEmoji(stars) {
    if (stars >= 20) return '☄️';
    if (stars >= 15) return '💫';
    if (stars >= 10) return '🌟';
    return '⭐';
}

async function readConfig(guildId) {
    try {
        const raw = await fs.readFile(configPath(guildId), 'utf8');
        return normalizeConfig(raw.trim() ? JSON.parse(raw) : null);
    } catch {
        return { ...DEFAULT_CONFIG, entries: {} };
    }
}

async function writeConfig(guildId, config) {
    const filePath = configPath(guildId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}

function withGuildLock(guildId, task) {
    const previous = guildQueues.get(guildId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    guildQueues.set(guildId, next);

    return next.finally(() => {
        if (guildQueues.get(guildId) === next) guildQueues.delete(guildId);
    });
}

async function updateConfig(guildId, update) {
    return withGuildLock(guildId, async () => {
        const config = await readConfig(guildId);
        await update(config);
        await writeConfig(guildId, config);
        return config;
    });
}

async function deleteConfig(guildId) {
    return withGuildLock(guildId, async () => {
        try {
            await fs.unlink(configPath(guildId));
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') return false;
            throw error;
        }
    });
}

function truncate(value, maxLength) {
    const text = String(value ?? '').trim() || '*No text content*';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function messageLink(message) {
    return `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
}

function buildEmbed(message, stars) {
    const attachments = [...message.attachments.values()];
    const image = attachments.find((attachment) =>
        attachment.contentType?.startsWith('image/') ?? /\.(png|jpe?g|gif|webp)$/i.test(attachment.name ?? '')
    );
    const nonImageAttachments = attachments.filter((attachment) => attachment !== image);
    const author = message.author;
    const displayEmoji = starboardEmoji(stars);
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setAuthor({
            name: author?.tag ?? author?.username ?? 'Unknown user',
            iconURL: author?.displayAvatarURL?.({ dynamic: true }),
        })
        .setDescription(truncate(message.content, 4096))
        .addFields(
            { name: `${displayEmoji} Stars`, value: String(stars), inline: true },
            { name: 'Source', value: `[Jump to message](${messageLink(message)})`, inline: true }
        )
        .setTimestamp(message.createdTimestamp);

    if (image) embed.setImage(image.url);

    if (nonImageAttachments.length) {
        const links = nonImageAttachments
            .map((attachment) => `[${attachment.name ?? 'attachment'}](${attachment.url})`)
            .join('\n');
        embed.addFields({ name: 'Attachments', value: truncate(links, 1024) });
    }

    return embed;
}

async function getStarCount(reaction, authorId, allowSelf) {
    const users = await reaction.users.fetch();
    const count = reaction.count ?? users.size;
    return Math.max(0, count - (!allowSelf && users.has(authorId) ? 1 : 0));
}

async function updateStarboardMessage(client, reaction) {
    if (reaction.partial && reaction.count !== 0) {
        await reaction.fetch().catch(() => null);
    }

    let sourceMessage = reaction.message;
    if (sourceMessage.partial) {
        sourceMessage = await sourceMessage.fetch().catch(() => null);
    }

    if (!sourceMessage?.guild || sourceMessage.author?.bot) return;

    await withGuildLock(sourceMessage.guild.id, async () => {
        const config = await readConfig(sourceMessage.guild.id);
        if (!reactionMatches(reaction, config.reactionEmoji)) return;
        if (!config.channelId || sourceMessage.channel.id === config.channelId) return;

        const starboardChannel = await client.channels.fetch(config.channelId).catch(() => null);
        if (!starboardChannel?.isTextBased?.() || starboardChannel.isDMBased?.()) return;

        const stars = await getStarCount(reaction, sourceMessage.author.id, config.allowSelf).catch(() => 0);
        const existing = config.entries[sourceMessage.id];

        if (stars < config.threshold) {
            if (!existing) return;

            const oldMessage = await starboardChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
            await oldMessage?.delete().catch(() => null);
            delete config.entries[sourceMessage.id];
            await writeConfig(sourceMessage.guild.id, config);
            return;
        }

        const payload = {
            content: `${starboardEmoji(stars)} **${stars}** <#${sourceMessage.channel.id}>`,
            embeds: [buildEmbed(sourceMessage, stars)],
        };

        if (existing) {
            const oldMessage = await starboardChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
            if (oldMessage) {
                await oldMessage.edit(payload);
                return;
            }
        }

        const starboardMessage = await starboardChannel.send(payload);
        config.entries[sourceMessage.id] = {
            starboardMessageId: starboardMessage.id,
            sourceChannelId: sourceMessage.channel.id,
        };
        await writeConfig(sourceMessage.guild.id, config);
    });
}

async function removeSourceMessage(client, message) {
    if (!message.guild) return;

    await withGuildLock(message.guild.id, async () => {
        const config = await readConfig(message.guild.id);
        const entry = config.entries[message.id];
        if (!entry || !config.channelId) return;

        const starboardChannel = await client.channels.fetch(config.channelId).catch(() => null);
        const starboardMessage = starboardChannel?.isTextBased?.()
            ? await starboardChannel.messages.fetch(entry.starboardMessageId).catch(() => null)
            : null;
        await starboardMessage?.delete().catch(() => null);

        delete config.entries[message.id];
        await writeConfig(message.guild.id, config);
    });
}

module.exports = (client) => {
    client.on('messageReactionAdd', (reaction) => {
        updateStarboardMessage(client, reaction).catch((error) => {
            console.error('Failed to update starboard after adding a reaction:', error);
        });
    });

    client.on('messageReactionRemove', (reaction) => {
        updateStarboardMessage(client, reaction).catch((error) => {
            console.error('Failed to update starboard after removing a reaction:', error);
        });
    });

    client.on('messageDelete', (message) => {
        removeSourceMessage(client, message).catch((error) => {
            console.error('Failed to remove deleted message from starboard:', error);
        });
    });
};

module.exports.readConfig = readConfig;
module.exports.updateConfig = updateConfig;
module.exports.deleteConfig = deleteConfig;
module.exports.parseReactionEmoji = parseReactionEmoji;
module.exports.starboardEmoji = starboardEmoji;
