const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { getJailConfig, jailUser, getJailedUser } = require('../../../jailHandler');
const { logJail } = require('../../../log');

function parseDuration(str) {
    if (!str) return null;

    const match = str.match(/^(\d+)(m|h|d)$/);
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'm') return amount * 60 * 1000;
    if (unit === 'h') return amount * 60 * 60 * 1000;
    if (unit === 'd') return amount * 24 * 60 * 60 * 1000;

    return null;
}

function formatDuration(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);

    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;

    return `${m}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jail')
        .setDescription('Jail a member')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to jail')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('duration')
                .setDescription('Optional duration, for example 10m, 2h, 1d')
                .setRequired(false)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        const target = interaction.options.getMember('user');
        const durationArg = interaction.options.getString('duration');

        if (!target) {
            return interaction.reply({
                content: 'Could not find that user.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't jail yourself.",
                ephemeral: true
            });
        }

        if (target.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: "You can't jail an admin.",
                ephemeral: true
            });
        }

        const config = await getJailConfig(guild.id);

        if (!config) {
            return interaction.reply({
                content: 'Jail system is not set up. Run `/setupjail` first.',
                ephemeral: true
            });
        }

        const alreadyJailed = await getJailedUser(guild.id, target.id);

        if (alreadyJailed) {
            return interaction.reply({
                content: 'That user is already jailed.',
                ephemeral: true
            });
        }

        let durationMs = null;

        if (durationArg) {
            durationMs = parseDuration(durationArg);

            if (!durationMs) {
                return interaction.reply({
                    content: 'Invalid duration. Use something like `10m`, `2h`, or `1d`.',
                    ephemeral: true
                });
            }
        }

        const expiresAt = durationMs ? Date.now() + durationMs : null;

        const jailRole = guild.roles.cache.get(config.jail_role_id);
        const jailChannel = guild.channels.cache.get(config.jail_channel_id);

        if (!jailRole || !jailChannel) {
            return interaction.reply({
                content: 'Jail role or channel is missing. Re-run `/setupjail`.',
                ephemeral: true
            });
        }

        const savedRoles = target.roles.cache
            .filter((r) => r.id !== guild.roles.everyone.id)
            .map((r) => r.id)
            .join(',');

        await target.roles.set([jailRole], `Jailed by ${interaction.user.tag}`);
        await jailUser(guild.id, target.id, savedRoles, expiresAt);
        await logJail(null, guild, target, interaction.member, durationMs ? formatDuration(durationMs) : null);

        const durationText = durationMs ? ` for **${formatDuration(durationMs)}**` : ' indefinitely';

        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`🔒 <@${target.id}>, you have been jailed${durationText} by **${interaction.user.tag}**.`);

        await jailChannel.send({ embeds: [embed] });

        return interaction.reply(`✅ **${target.user.tag}** has been jailed${durationText}.`);
    }
};