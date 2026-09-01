const fs = require('fs/promises');
const path = require('path');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logWarn } = require('../../log');

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

async function writeWarns(guildId, data) {
    await ensureGuildDirExists(guildId);
    await fs.writeFile(warnsPath(guildId), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
    name: 'warn',
    aliases: ['warning'],
    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('You do not have permission to warn members. <:smirk2:1498272372539785286>');
        }

        const target = message.mentions.members.first();
        if (!target) return message.reply('Mention a user to warn. Example: `,warn @user spamming`');

        if (target.id === message.author.id) {
            return message.reply("You can't warn yourself.");
        }

        const reason = args.slice(1).join(' ').trim() || 'No reason specified';

        const guildId = message.guild.id;
        const userId = target.id;

        const store = await readWarns(guildId);
        const entry = {
            moderatorId: message.author.id,
            moderatorTag: message.author.tag,
            reason,
            timestamp: Date.now(),
        };

        if (!store[userId]) store[userId] = [];
        store[userId].push(entry);

        await writeWarns(guildId, store);

        const warnCount = store[userId].length;

        try {
            const embed = new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle('Warning')
                .setDescription(`You have been warned in **${message.guild.name}**.`)
                .addFields(
                    { name: 'Warned By', value: message.author.tag, inline: true },
                    { name: 'Warned At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Warnings', value: String(warnCount), inline: true }
                )
                .setFooter({ text: `Server ID: ${message.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] });
        } catch (err) {
            console.error('Error sending warn DM:', err);
        }

        // Log to modlog (if configured)
        await logWarn(message.client, message.guild, target.user, message.author, reason, warnCount);

        return message.reply(`👍 **Warned ${target.user.tag} for**: *${reason}*\n\-# ${target.user.tag} is on ${warnCount} warn(s).`);
    },
};
