const fs = require('fs/promises');
const path = require('path');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');

function guildDir(guildId) {
    return path.join(DATA_DIR, String(guildId));
}

function warnsPath(guildId) {
    return path.join(guildDir(guildId), 'warns.json');
}

async function ensureGuildDirExists(guildId) {
    await fs.mkdir(guildDir(guildId), { recursive: true });
}

async function readWarns(guildId) {
    try {
        await ensureGuildDirExists(guildId);
        const raw = await fs.readFile(warnsPath(guildId), 'utf8').catch(() => '');
        if (!raw.trim()) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function isSnowflake(str) {
    return /^\d{15,22}$/.test(String(str ?? '').trim());
}

module.exports = {
    name: 'warnings',
    aliases: ['warns', 'warnhistory', 'wh'],
    async execute(message, args) {
        if (!message.guild) return;

        const mentioned = message.mentions.users.first() ?? null;
        const rawId = args[0] && isSnowflake(args[0]) ? String(args[0]) : null;

        const targetUser =
            mentioned ??
            (rawId
                ? await message.client.users.fetch(rawId).catch(function() { return null })
                : message.author);

        if (!targetUser) {
            return message.reply('Could not find that user. Try mentioning them or using their user ID.');
        }

        const viewingSelf = targetUser.id === message.author.id;

        // If you're trying to view someone else's history, require mod perms
        if (!viewingSelf && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply("You don't have permission to view other users' warnings.");
        }

        const store = await readWarns(message.guild.id);
        const list = Array.isArray(store[targetUser.id]) ? store[targetUser.id] : [];
        const total = list.length;

        if (total === 0) {
            return message.reply(`**${targetUser.tag}** has no warnings.`);
        }

        const shown = list.slice(-10).reverse(); // newest first, max 10

        const lines = shown.map((w, idx) => {
            const num = total - idx; // absolute warning number (newest gets highest)
            const when = w?.timestamp ? `<t:${Math.floor(w.timestamp / 1000)}:R>` : 'Unknown time';
            const mod = w?.moderatorTag ?? 'Unknown mod';
            const reason = (w?.reason ?? 'No reason specified').toString();
            const safeReason = reason.length > 300 ? `${reason.slice(0, 300)}…` : reason;

            return `**#${num}** • ${when}\n**Mod:** ${mod}\n**Reason:** ${safeReason}`;
        });

        const embed = new EmbedBuilder()
            .setColor('#ffcc00')
            .setTitle('Warnings History')
            .setDescription(`**User:** ${targetUser.tag}\n**Total Warnings:** ${total}\n\n${lines.join('\n\n')}`)
            .setFooter({ text: `Server ID: ${message.guild.id}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};