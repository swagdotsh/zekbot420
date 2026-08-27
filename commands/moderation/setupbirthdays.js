const fs = require('fs/promises');
const path = require('path');
const {
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'birthdayConfig.json');

async function ensureConfigFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(CONFIG_PATH);
    } catch {
        await fs.writeFile(CONFIG_PATH, JSON.stringify({}, null, 2), 'utf8');
    }
}

async function loadConfig() {
    await ensureConfigFile();

    try {
        const raw = await fs.readFile(CONFIG_PATH, 'utf8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

async function saveConfig(config) {
    await ensureConfigFile();
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = {
    name: 'setupbirthdays',
    aliases: ['setupbirthday'],

    async execute(message) {
        if (!message.guild) return;

        if (
            !message.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            !message.member.permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
            return message.reply(
                'You need the `Manage Server` and `Manage Roles` permissions to use this command. <:smirk2:1498272372539785286>'
            );
        }

        const botMember = message.guild.members.me;

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(
                'I need the `Manage Roles` permission to create and give out the birthday role. <:smirk2:1498272372539785286>'
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply(
                'I need the `Manage Channels` permission to create the birthday announcement channel. <:smirk2:1498272372539785286>'
            );
        }

        const config = await loadConfig();
        const existingGuildConfig = config[message.guild.id] ?? {};

        let birthdayRole = existingGuildConfig.roleId
            ? message.guild.roles.cache.get(existingGuildConfig.roleId)
            : null;

        if (!birthdayRole) {
            birthdayRole = await message.guild.roles.create({
                name: 'Birthday',
                color: '#ff9ad5',
                reason: `Birthday system setup by ${message.author.tag}`,
            });
        }

        let birthdayChannel = existingGuildConfig.channelId
            ? message.guild.channels.cache.get(existingGuildConfig.channelId)
            : null;

        if (!birthdayChannel) {
            birthdayChannel = await message.guild.channels.create({
                name: 'birthdays',
                type: ChannelType.GuildText,
                reason: `Birthday system setup by ${message.author.tag}`,
                permissionOverwrites: [
                    {
                        id: message.guild.roles.everyone.id,
                        deny: [
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.CreatePublicThreads,
                            PermissionFlagsBits.CreatePrivateThreads,
                        ],
                    },
                ],
            });
        }

        config[message.guild.id] = {
            roleId: birthdayRole.id,
            channelId: birthdayChannel.id,
            updatedAt: new Date().toISOString(),
        };

        await saveConfig(config);

        return message.reply(
            `✅ Birthday system setup complete!\n` +
            `Birthday role: ${birthdayRole}\n` +
            `Birthday announcement channel: ${birthdayChannel}`
        );
    },
};
