const fs = require('fs/promises');
const path = require('path');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logUnwarn } = require('../../log');

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

function parsePositiveInt(s) {
    const n = Number.parseInt(String(s ?? ''), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function parseWarnIdToken(token) {
    const raw = String(token ?? '').trim();
    if (!raw) return null;

    const m1 = raw.match(/^#(\d+)$/);
    if (m1) return parsePositiveInt(m1[1]);

    const m2 = raw.match(/^id:(\d+)$/i);
    if (m2) return parsePositiveInt(m2[1]);

    if (/^\d+$/.test(raw)) return parsePositiveInt(raw);

    return null;
}

async function persistWarnStore({ guildId, store, userId, list }) {
    if (list.length === 0) delete store[userId];
    else store[userId] = list;
    await writeWarns(guildId, store);
}

async function sendUnwarnDm({ target, guild, removedByTag, removedCount, newCount, note, warnId = null }) {
    try {
        const embed = new EmbedBuilder()
            .setColor('#43b581')
            .setTitle('Warning Removed')
            .setDescription(`A warning has been removed in **${guild.name}**.`)
            .addFields(
                { name: 'Removed By', value: removedByTag, inline: true },
                { name: 'Removed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                ...(warnId != null
                    ? [{ name: 'Removed Warn ID', value: `#${warnId}`, inline: true }]
                    : [{ name: 'Warnings Removed', value: String(removedCount), inline: true }]),
                { name: 'Total Warnings Now', value: String(newCount), inline: true },
                ...(note ? [{ name: 'Note', value: note.slice(0, 1024), inline: false }] : [])
            )
            .setFooter({ text: `Server ID: ${guild.id}` })
            .setTimestamp();

        await target.send({ embeds: [embed] });
    } catch (err) {
        console.error('Error sending unwarn DM:', err);
    }
}

async function finalizeUnwarn({ message, target, guildId, store, userId, list, removed, note, removedModeLabel, removedWarnId = null }) {
    await persistWarnStore({ guildId, store, userId, list });

    const newCount = list.length;
    const removedCount = removed.length;

    await sendUnwarnDm({
        target,
        guild: message.guild,
        removedByTag: message.author.tag,
        removedCount,
        newCount,
        note,
        warnId: removedWarnId
    });

    await logUnwarn(
        message.client,
        message.guild,
        target.user,
        message.author,
        removedCount,
        newCount,
        note || null,
        removedModeLabel
    );

    const label = removedWarnId != null
        ? `warn **#${removedWarnId}**`
        : `**${removedCount}** warning(s)`;

    return message.reply(
        `👍 Removed ${label} from **${target.user.tag}**.\n-# ${target.user.tag} is at **${newCount}** warning(s).`
    );
}

module.exports = {
    name: 'unwarn',
    aliases: ['removewarn', 'delwarn', 'rmwarn'],
    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('You do not have permission to unwarn members. <:smirk2:1498272372539785286>');
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply(
                'Mention a user to unwarn.\n' +
                'Examples:\n' +
                '`\\,unwarn @user #3 optional note` (remove warn ID #3)\n' +
                '`\\,unwarn @user recent 2 optional note` (remove 2 most recent warns)\n' +
                '`\\,unwarn @user` (remove 1 most recent warn)'
            );
        }

        if (target.id === message.author.id) {
            return message.reply("You can't unwarn yourself.");
        }

        const guildId = message.guild.id;
        const userId = target.id;

        const store = await readWarns(guildId);
        const list = Array.isArray(store[userId]) ? store[userId] : [];

        if (list.length === 0) {
            return message.reply(`**${target.user.tag}** has no warnings to remove.`);
        }

        const mode = String(args[1] ?? '').trim().toLowerCase();

        if (mode === 'recent' || mode === 'last') {
            const amount = parsePositiveInt(args[2]) ?? 1;
            const note = args.slice(3).join(' ').trim();
            const removed = list.splice(Math.max(0, list.length - amount), amount);

            return finalizeUnwarn({ message, target, guildId, store, userId, list, removed, note, removedModeLabel: `recent:${amount}` });
        }

        const warnId = parseWarnIdToken(args[1]);

        if (warnId != null) {
            if (warnId < 1 || warnId > list.length) {
                return message.reply(
                    `That warn ID is out of range. **${target.user.tag}** has **${list.length}** warning(s).`
                );
            }

            const note = args.slice(2).join(' ').trim();
            const [removedOne] = list.splice(warnId - 1, 1);
            const removed = removedOne ? [removedOne] : [];

            return finalizeUnwarn({ message, target, guildId, store, userId, list, removed, note, removedModeLabel: `id:${warnId}`, removedWarnId: warnId });
        }

        const note = args.slice(1).join(' ').trim();
        const removed = list.splice(Math.max(0, list.length - 1), 1);

        return finalizeUnwarn({ message, target, guildId, store, userId, list, removed, note, removedModeLabel: 'recent:1' });
    },
};
