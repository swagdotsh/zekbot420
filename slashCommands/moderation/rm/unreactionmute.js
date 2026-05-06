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

function reactionMuteConfigPath(guildId) {
    return path.join(guildDir(guildId), 'reactionmute.json');
}

async function readReactionMuteConfig(guildId) {
    try {
        const raw = await fs.readFile(reactionMuteConfigPath(guildId), 'utf8').catch(() => '');

        if (!raw.trim()) return null;

        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') return null;

        return parsed;
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unreactionmute')
        .setDescription('Remove a reaction mute from a member')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to remove reaction mute from')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for removing the reaction mute')
                .setRequired(false)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason')?.trim() || 'No reason specified';

        if (!target) {
            return interaction.reply({
                content: 'Could not find that user.',
                ephemeral: true
            });
        }

        const me = guild.members.me;

        if (!me) {
            return interaction.reply({
                content: 'I could not verify my own permissions.',
                ephemeral: true
            });
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'I need the **Manage Roles** permission to remove reaction mutes.',
                ephemeral: true
            });
        }

        const config = await readReactionMuteConfig(guild.id);

        if (!config?.roleId) {
            return interaction.reply({
                content: 'Reaction mute has not been set up yet. Run `/rmsetup` first.',
                ephemeral: true
            });
        }

        const role = guild.roles.cache.get(config.roleId);

        if (!role) {
            return interaction.reply({
                content: 'The reaction mute role could not be found. Run `/rmsetup` again.',
                ephemeral: true
            });
        }

        if (!target.roles.cache.has(role.id)) {
            return interaction.reply({
                content: `${target.user.tag} is not reaction muted.`,
                ephemeral: true
            });
        }

        if (role.position >= me.roles.highest.position) {
            return interaction.reply({
                content: 'I cannot remove the reaction mute role because it is higher than or equal to my highest role.',
                ephemeral: true
            });
        }

        if (target.roles.highest.position >= me.roles.highest.position) {
            return interaction.reply({
                content: 'I cannot remove the reaction mute role from that member because their top role is higher than or equal to my highest role.',
                ephemeral: true
            });
        }

        try {
            await target.roles.remove(role, `Reaction unmuted by ${interaction.user.tag}: ${reason}`);

            const embed = new EmbedBuilder()
                .setColor('#43b581')
                .setTitle('Reaction Unmuted')
                .setDescription(`Your reaction mute has been removed in **${guild.name}**.`)
                .addFields(
                    { name: 'Removed By', value: interaction.user.tag, inline: true },
                    { name: 'Removed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Role', value: role.name, inline: true }
                )
                .setFooter({ text: `Server ID: ${guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch(() => null);

            return interaction.reply(`**Removed reaction mute from ${target.user.tag}**\n-# Reason: ${reason}`);
        } catch (error) {
            console.error('unreactionmute error:', error);

            return interaction.reply({
                content: 'There was an error removing the reaction mute.',
                ephemeral: true
            });
        }
    }
};