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
    name: 'reactionmute',
    aliases: ['rmute', 'rm'],
    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('You do not have permission to reaction mute members.');
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply('Mention a user to reaction mute. Example: `,reactionmute @user spamming reactions`');
        }

        if (target.id === message.author.id) {
            return message.reply("You can't reaction mute yourself.");
        }

        if (target.id === message.guild.ownerId) {
            return message.reply("You can't reaction mute the server owner.");
        }

        const me = message.guild.members.me;
        if (!me) {
            return message.reply('I could not verify my own permissions.');
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('I need the **Manage Roles** permission to reaction mute members.');
        }

        const config = await readReactionMuteConfig(message.guild.id);
        if (!config?.roleId) {
            return message.reply('Reaction mute has not been set up yet. Run `,rmsetup` first.');
        }

        const role = message.guild.roles.cache.get(config.roleId);
        if (!role) {
            return message.reply('The reaction mute role could not be found. Run `,rmsetup` again.');
        }

        if (target.roles.cache.has(role.id)) {
            return message.reply(""+target.user.tag+" is already reaction muted.");        }

        if (message.member.id !== message.guild.ownerId && target.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply("You can't reaction mute a member with the same or higher role than you.");
        }

        if (role.position >= me.roles.highest.position) {
            return message.reply('I cannot assign the reaction mute role because it is higher than or equal to my highest role.');
        }

        if (target.roles.highest.position >= me.roles.highest.position) {
            return message.reply('I cannot reaction mute that member because their top role is higher than or equal to my highest role.');
        }

        const reason = args.slice(1).join(' ').trim() || 'No reason specified';

        try {
            await target.roles.add(role, `Reaction muted by ${message.author.tag}: ${reason}`);

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('Reaction Muted')
                .setDescription(`You have been reaction muted in **${message.guild.name}**.`)
                .addFields(
                    { name: 'Muted By', value: message.author.tag, inline: true },
                    { name: 'Muted At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Role', value: role.name, inline: true }
                )
                .setFooter({ text: `Server ID: ${message.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch(() => null);

            return message.reply(`**:timeout: Reaction muted ${target.user.tag}**\n\-# Reason: ${reason}`);
        } catch (error) {
            console.error('reactionmute error:', error);
            return message.reply('There was an error applying the reaction mute.');
        }
    },
};