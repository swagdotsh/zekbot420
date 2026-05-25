const fs = require('fs');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType
} = require('discord.js');

const dataDir = path.resolve(process.cwd(), 'data');

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
    await fs.promises.writeFile(cfgPath, JSON.stringify(config, null, 2), 'utf8');
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
        const guildId = interaction.guild.id;

        if (subcommand === 'disable') {
            const config = await readGuildConfig(guildId);

            config.channelId = null;

            await writeGuildConfig(guildId, config);

            return interaction.reply({
                content: 'Modlog has been disabled for this server.',
                ephemeral: true
            });
        }

        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');

            if (!channel || !channel.isTextBased?.() || channel.isDMBased?.()) {
                return interaction.reply({
                    content: 'Please choose a server text channel.',
                    ephemeral: true
                });
            }

            const config = await readGuildConfig(guildId);

            config.channelId = channel.id;

            await writeGuildConfig(guildId, config);

            return interaction.reply({
                content: `Modlog channel has been set to ${channel}.`,
                ephemeral: true
            });
        }
    }
};