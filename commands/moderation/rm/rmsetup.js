const fs = require('fs/promises');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ROLE_NAME = 'Reaction Muted';

function guildDir(guildId) {
    return path.join(DATA_DIR, String(guildId));
}

function reactionMuteConfigPath(guildId) {
    return path.join(guildDir(guildId), 'reactionmute.json');
}

async function ensureGuildDirExists(guildId) {
    await fs.mkdir(guildDir(guildId), { recursive: true });
}

async function writeReactionMuteConfig(guildId, data) {
    await ensureGuildDirExists(guildId);
    await fs.writeFile(
        reactionMuteConfigPath(guildId),
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

module.exports = {
    name: 'rmsetup',
    aliases: ['reactionmutesetup', 'setupreactionmute'],
    async execute(message) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('You do not have permission to set up reaction muting.');
        }

        const me = message.guild.members.me;
        if (!me) {
            return message.reply('I could not verify my own permissions.');
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('I need the **Manage Roles** permission to create the reaction mute role.');
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('I need the **Manage Channels** permission to apply reaction restrictions to channels.');
        }

        let role = message.guild.roles.cache.find(function(role) { return role.name === ROLE_NAME });

        try {
            if (!role) {
                role = await message.guild.roles.create({
                    name: ROLE_NAME,
                    permissions: [],
                    reason: `Reaction mute setup requested by ${message.author.tag}`
                });
            }

            let updatedChannels = 0;

            for (const channel of message.guild.channels.cache.values()) {
                if (!channel.permissionOverwrites) continue;

                await channel.permissionOverwrites.edit(
                    role,
                    { AddReactions: false },
                    { reason: `Reaction mute setup requested by ${message.author.tag}` }
                );

                updatedChannels++;
            }

            await writeReactionMuteConfig(message.guild.id, {
                roleId: role.id,
                roleName: role.name,
                setupBy: message.author.id,
                setupAt: Date.now()
            });

            return message.reply(
                `# ✅ Reaction mute setup complete.\n` +
                "Role: **"+role.name+"**\n" +
                `Updated channels: **${updatedChannels}**\n` +
                `Reaction mutes are now ready to use.`
            );
        } catch (error) {
            console.error('rmsetup error:', error);
            return message.reply(
                'There was an error setting up reaction muting. Make sure my role is high enough to manage the new role and channel overwrites.'
            );
        }
    },
};