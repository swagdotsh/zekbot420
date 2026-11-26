const fs = require('fs/promises');
const path = require('path');
const { writeJsonAtomic } = require('../../jsonStore');
const { DATA_DIR: PROJECT_DATA_DIR } = require('../../paths');
const {
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    InteractionContextType,
    MessageFlags
} = require('discord.js');
const { ok, fail } = require('../../ui');

const DATA_DIR = PROJECT_DATA_DIR;
const CONFIG_PATH = path.join(DATA_DIR, 'birthdayConfig.json');

async function ensureConfigFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(CONFIG_PATH);
    } catch {
        await writeJsonAtomic(CONFIG_PATH, {});
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
    await writeJsonAtomic(CONFIG_PATH, config);
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
                flags: MessageFlags.Ephemeral,
            });
        }

        const botMember = interaction.guild.members.me;

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'I need the `Manage Roles` permission to create and give out the birthday role. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'I need the `Manage Channels` permission to create the birthday announcement channel. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        const config = await loadConfig();
        const existingGuildConfig = config[interaction.guild.id] ?? {};

        if (existingGuildConfig.roleId || existingGuildConfig.channelId) {
            return interaction.editReply(
                'Birthday system is already configured. Members can use `/birthday set`, `/birthday list` and `/birthday remove`. <:smirk2:1498272372539785286>'
            );
        }

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
            ok('Birthday system is set up!\n') +
            `Birthday role: ${birthdayRole}\n` +
            `Birthday announcement channel: ${birthdayChannel}`
        );
    },
};
