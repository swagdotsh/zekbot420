const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
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
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to warn')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason')?.trim() || 'No reason specified';

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't warn yourself.",
                ephemeral: true
            });
        }

        const guildId = interaction.guild.id;
        const userId = target.id;

        const store = await readWarns(guildId);

        const entry = {
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason,
            timestamp: Date.now()
        };

        if (!store[userId]) store[userId] = [];

        store[userId].push(entry);

        await writeWarns(guildId, store);

        const warnCount = store[userId].length;

        try {
            const embed = new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle('Warning')
                .setDescription(`You have been warned in **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Warned By', value: interaction.user.tag, inline: true },
                    { name: 'Warned At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Warnings', value: String(warnCount), inline: true }
                )
                .setFooter({ text: `Server ID: ${interaction.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] });
        } catch (err) {
            console.error('Error sending warn DM:', err);
        }

        await logWarn(interaction.client, interaction.guild, target.user, interaction.user, reason, warnCount);

        return interaction.reply(
            `**Warned ${target.user.tag} for**: *${reason}*\n-# ${target.user.tag} is on ${warnCount} warn(s).`
        );
    }
};