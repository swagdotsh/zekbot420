const fs = require('fs/promises');
const path = require('path');
const {
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    InteractionContextType,
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
    data: new SlashCommandBuilder()
        .setName('setupbirthdays')
        .setDescription('Set up the birthday system for this server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        if (
            !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
            return interaction.reply({
                content: 'You need the `Manage Server` and `Manage Roles` permissions to use this command. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const botMember = interaction.guild.members.me;

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'I need the `Manage Roles` permission to create and give out the birthday role. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'I need the `Manage Channels` permission to create the birthday announcement channel. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        await interaction.deferReply({
            ephemeral: true,
        });

        const config = await loadConfig();
        const existingGuildConfig = config[interaction.guild.id] ?? {};

        let birthdayRole = existingGuildConfig.roleId
            ? interaction.guild.roles.cache.get(existingGuildConfig.roleId)
            : null;

        if (!birthdayRole) {
            birthdayRole = await interaction.guild.roles.create({
                name: 'Birthday',
                color: '#ff9ad5',
                reason: `Birthday system setup by ${interaction.user.tag}`,
            });
        }

        let birthdayChannel = existingGuildConfig.channelId
            ? interaction.guild.channels.cache.get(existingGuildConfig.channelId)
            : null;

        if (!birthdayChannel) {
            birthdayChannel = await interaction.guild.channels.create({
                name: 'birthdays',
                type: ChannelType.GuildText,
                reason: `Birthday system setup by ${interaction.user.tag}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.CreatePublicThreads,
                            PermissionFlagsBits.CreatePrivateThreads,
                        ],
                    },
                ],
            });
        }

        config[interaction.guild.id] = {
            roleId: birthdayRole.id,
            channelId: birthdayChannel.id,
            updatedAt: new Date().toISOString(),
        };

        await saveConfig(config);

        return interaction.editReply(
            `✅ Birthday system setup complete!\n` +
            `Birthday role: ${birthdayRole}\n` +
            `Birthday announcement channel: ${birthdayChannel}`
        );
    },
};