const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
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

async function finalizeUnwarn({
                                  interaction,
                                  target,
                                  guildId,
                                  store,
                                  userId,
                                  list,
                                  removed,
                                  note,
                                  removedModeLabel,
                                  removedWarnId = null
                              }) {
    await persistWarnStore({ guildId, store, userId, list });

    const newCount = list.length;
    const removedCount = removed.length;

    await sendUnwarnDm({
        target,
        guild: interaction.guild,
        removedByTag: interaction.user.tag,
        removedCount,
        newCount,
        note,
        warnId: removedWarnId
    });

    await logUnwarn(
        interaction.client,
        interaction.guild,
        target.user,
        interaction.user,
        removedCount,
        newCount,
        note || null,
        removedModeLabel
    );

    const label = removedWarnId != null
        ? `warn **#${removedWarnId}**`
        : `**${removedCount}** warning(s)`;

    return interaction.reply(
        `👍 Removed ${label} from **${target.user.tag}**.\n-# ${target.user.tag} is at **${newCount}** warning(s).`
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remove warnings from a member')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to remove warnings from')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('mode')
                .setDescription('How to remove warnings')
                .setRequired(false)
                .addChoices(
                    { name: 'Most recent warning', value: 'recent' },
                    { name: 'Specific warning ID', value: 'id' }
                )
        )
        .addIntegerOption((opt) =>
            opt
                .setName('amount')
                .setDescription('Amount of recent warnings to remove')
                .setRequired(false)
                .setMinValue(1)
        )
        .addIntegerOption((opt) =>
            opt
                .setName('warn_id')
                .setDescription('Specific warning ID to remove')
                .setRequired(false)
                .setMinValue(1)
        )
        .addStringOption((opt) =>
            opt
                .setName('note')
                .setDescription('Optional note for the unwarn')
                .setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const mode = interaction.options.getString('mode') || 'recent';
        const amount = interaction.options.getInteger('amount') || 1;
        const warnId = interaction.options.getInteger('warn_id');
        const note = interaction.options.getString('note')?.trim() || '';

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't unwarn yourself.",
                ephemeral: true
            });
        }

        const guildId = interaction.guild.id;
        const userId = target.id;

        const store = await readWarns(guildId);
        const list = Array.isArray(store[userId]) ? store[userId] : [];

        if (list.length === 0) {
            return interaction.reply({
                content: `**${target.user.tag}** has no warnings to remove.`,
                ephemeral: true
            });
        }

        if (mode === 'id') {
            if (!warnId) {
                return interaction.reply({
                    content: 'Please provide `warn_id` when using specific warning ID mode.',
                    ephemeral: true
                });
            }

            if (warnId > list.length) {
                return interaction.reply({
                    content: `That warn ID is out of range. **${target.user.tag}** has **${list.length}** warning(s).`,
                    ephemeral: true
                });
            }

            const [removedOne] = list.splice(warnId - 1, 1);
            const removed = removedOne ? [removedOne] : [];

            return finalizeUnwarn({
                interaction,
                target,
                guildId,
                store,
                userId,
                list,
                removed,
                note,
                removedModeLabel: `id:${warnId}`,
                removedWarnId: warnId
            });
        }

        const removed = list.splice(Math.max(0, list.length - amount), amount);

        return finalizeUnwarn({
            interaction,
            target,
            guildId,
            store,
            userId,
            list,
            removed,
            note,
            removedModeLabel: `recent:${amount}`
        });
    }
};