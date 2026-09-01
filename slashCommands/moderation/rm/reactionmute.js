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
        .setName('reactionmute')
        .setDescription('Prevent a member from adding reactions')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to reaction mute')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for the reaction mute')
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

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't reaction mute yourself.",
                ephemeral: true
            });
        }

        if (target.id === guild.ownerId) {
            return interaction.reply({
                content: "You can't reaction mute the server owner.",
                ephemeral: true
            });
        }

        const me = guild.members.me;

        if (!me) {
            return interaction.reply({
                content: 'I could not verify my own permissions. <:smirk2:1498272372539785286>',
                ephemeral: true
            });
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'I need the **Manage Roles** permission to reaction mute members. <:smirk2:1498272372539785286>',
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

        if (target.roles.cache.has(role.id)) {
            return interaction.reply({
                content: `${target.user.tag} is already reaction muted.`,
                ephemeral: true
            });
        }

        if (
            interaction.member.id !== guild.ownerId &&
            target.roles.highest.position >= interaction.member.roles.highest.position
        ) {
            return interaction.reply({
                content: "You can't reaction mute a member with the same or higher role than you.",
                ephemeral: true
            });
        }

        if (role.position >= me.roles.highest.position) {
            return interaction.reply({
                content: 'I cannot assign the reaction mute role because it is higher than or equal to my highest role.',
                ephemeral: true
            });
        }

        if (target.roles.highest.position >= me.roles.highest.position) {
            return interaction.reply({
                content: 'I cannot reaction mute that member because their top role is higher than or equal to my highest role.',
                ephemeral: true
            });
        }

        try {
            await target.roles.add(role, `Reaction muted by ${interaction.user.tag}: ${reason}`);

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('Reaction Muted')
                .setDescription(`You have been reaction muted in **${guild.name}**.`)
                .addFields(
                    { name: 'Muted By', value: interaction.user.tag, inline: true },
                    { name: 'Muted At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Role', value: role.name, inline: true }
                )
                .setFooter({ text: `Server ID: ${guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch(() => null);

            return interaction.reply(`**:timeout: Reaction muted ${target.user.tag}**\n-# Reason: ${reason}`);
        } catch (error) {
            console.error('reactionmute error:', error);

            return interaction.reply({
                content: 'There was an error applying the reaction mute.',
                ephemeral: true
            });
        }
    }
};
