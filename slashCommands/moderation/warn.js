const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const { logWarn } = require('../../log');
const { updateJson } = require('../../jsonStore');
const { DATA_DIR: PROJECT_DATA_DIR } = require('../../paths');

const DATA_DIR = PROJECT_DATA_DIR;

function guildDir(guildId) {
    return path.join(DATA_DIR, String(guildId));
}

function warnsPath(guildId) {
    return path.join(guildDir(guildId), 'warns.json');
}

async function ensureGuildDirExists(guildId) {
    await fs.mkdir(guildDir(guildId), { recursive: true });
}



module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
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
                flags: MessageFlags.Ephemeral
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't warn yourself.",
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.guild.id;
        const userId = target.id;

        const entry = {
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason,
            timestamp: Date.now()
        };

        await ensureGuildDirExists(guildId);
        const store = await updateJson(warnsPath(guildId), {}, (current) => {
            if (!Array.isArray(current[userId])) current[userId] = [];
            current[userId].push(entry);
        });

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
            `👍 **Warned ${target.user.tag} for**: *${reason}*\n-# ${target.user.tag} is on ${warnCount} warn(s).`
        );
    }
};