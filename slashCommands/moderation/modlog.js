const fs = require('fs');
const path = require('path');
const { updateJson } = require('../../jsonStore');
const { ok, fail } = require('../../ui');
const { DATA_DIR: PROJECT_DATA_DIR } = require('../../paths');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    MessageFlags
} = require('discord.js');

const dataDir = PROJECT_DATA_DIR;

function guildDir(guildId) {
    return path.join(dataDir, String(guildId));
}

function guildConfigPath(guildId) {
    return path.join(guildDir(guildId), 'modlog.json');
}

async function readGuildConfig(guildId) {
    const cfgPath = guildConfigPath(guildId);

    try {
        if (!fs.existsSync(cfgPath)) return { channelId: null };

        const txt = await fs.promises.readFile(cfgPath, 'utf8');

        if (!txt.trim()) return { channelId: null };

        const parsed = JSON.parse(txt);

        return {
            channelId: parsed?.channelId ?? null
        };
    } catch {
        return { channelId: null };
    }
}

async function writeGuildConfig(guildId, config) {
    const dir = guildDir(guildId);
    const cfgPath = guildConfigPath(guildId);

    await fs.promises.mkdir(dir, { recursive: true });
    await updateJson(cfgPath, {}, (current) => ({ ...current, ...config }));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modlog')
        .setDescription('Set or disable the modlog channel')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('set')
                .setDescription('Set the modlog channel')
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('The channel to send modlog messages to')
                        .setRequired(true)
                        .addChannelTypes(
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('disable')
                .setDescription('Disable modlog for this server')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        return subcommand === 'disable' ? this.runDisable(interaction) : this.runSet(interaction);
    },

    async runDisable(interaction) {
        const config = await readGuildConfig(interaction.guild.id);

        if (!config.channelId) {
            return interaction.reply({
                content: fail('Modlog is not set up in this server.'),
                flags: MessageFlags.Ephemeral
            });
        }

        await writeGuildConfig(interaction.guild.id, { channelId: null });

        return interaction.reply({
            content: ok('Modlog has been disabled for this server.'),
            flags: MessageFlags.Ephemeral
        });
    },

    async runSet(interaction) {
        const channel = interaction.options.getChannel('channel');

        if (!channel || !channel.isTextBased?.() || channel.isDMBased?.()) {
            return interaction.reply({
                content: fail('Please choose a server text channel.'),
                flags: MessageFlags.Ephemeral
            });
        }

        const config = await readGuildConfig(interaction.guild.id);
        await writeGuildConfig(interaction.guild.id, { channelId: channel.id });

        const moved = config.channelId && config.channelId !== channel.id ? ` (moved from <#${config.channelId}>)` : '';
        return interaction.reply({
            content: ok(`Modlog channel set to ${channel}${moved}. AutoMod alerts can be managed with \`/automod words\`.`),
            flags: MessageFlags.Ephemeral
        });
    }
};
