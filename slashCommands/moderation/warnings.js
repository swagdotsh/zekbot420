const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View your warnings or another user’s warnings')
        .setContexts(InteractionContextType.Guild)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to view warnings for')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const viewingSelf = targetUser.id === interaction.user.id;

        if (!viewingSelf && !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: "You don't have permission to view other users' warnings.",
                ephemeral: true
            });
        }

        const store = await readWarns(interaction.guild.id);
        const list = Array.isArray(store[targetUser.id]) ? store[targetUser.id] : [];
        const total = list.length;

        if (total === 0) {
            return interaction.reply({
                content: `**${targetUser.tag}** has no warnings.`,
                ephemeral: true
            });
        }

        const shown = list.slice(-10).reverse();

        const lines = shown.map((w, idx) => {
            const num = total - idx;
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
            .setFooter({ text: `Server ID: ${interaction.guild.id}` })
            .setTimestamp();

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};