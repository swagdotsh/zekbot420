const fs = require('fs/promises');
const path = require('path');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

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
    name: 'unreactionmute',
    aliases: ['unrmute', 'unrm'],
    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('You do not have permission to remove reaction mutes.');
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply('Mention a user to unreactionmute. Example: `,unreactionmute @user appeal accepted`');
        }

        const me = message.guild.members.me;
        if (!me) {
            return message.reply('I could not verify my own permissions.');
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('I need the **Manage Roles** permission to remove reaction mutes.');
        }

        const config = await readReactionMuteConfig(message.guild.id);
        if (!config?.roleId) {
            return message.reply('Reaction mute has not been set up yet. Run `,rmsetup` first.');
        }

        const role = message.guild.roles.cache.get(config.roleId);
        if (!role) {
            return message.reply('The reaction mute role could not be found. Run `,rmsetup` again.');
        }

        if (!target.roles.cache.has(role.id)) {
            return message.reply(`${target.user.tag} is not reaction muted.`);
        }

        if (role.position >= me.roles.highest.position) {
            return message.reply('I cannot remove the reaction mute role because it is higher than or equal to my highest role.');
        }

        if (target.roles.highest.position >= me.roles.highest.position) {
            return message.reply('I cannot remove the reaction mute role from that member because their top role is higher than or equal to my highest role.');
        }

        const reason = args.slice(1).join(' ').trim() || 'No reason specified';

        try {
            await target.roles.remove(role, `Reaction unmuted by ${message.author.tag}: ${reason}`);

            const embed = new EmbedBuilder()
                .setColor('#43b581')
                .setTitle('Reaction Unmuted')
                .setDescription("Your reaction mute has been removed in **"+message.guild.name+"**.")
                .addFields(
                    { name: 'Removed By', value: message.author.tag, inline: true },
                    { name: 'Removed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Role', value: role.name, inline: true }
                )
                .setFooter({ text: `Server ID: ${message.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch(() => null);

            return message.reply(`**Removed reaction mute from ${target.user.tag}**\n\-# Reason: ${reason}`);
        } catch (error) {
            console.error('unreactionmute error:', error);
            return message.reply('There was an error removing the reaction mute.');
        }
    },
};