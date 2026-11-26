const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const { ok, fail } = require('../../ui');
const { getConfig, setConfig } = require('../../leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levelsetup')
        .setDescription('Configure the leveling system')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('The channel for level-up announcements')
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
        )
        .addIntegerOption((opt) =>
            opt
                .setName('xp_min')
                .setDescription('Minimum XP per message, from 5 to 44')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(44)
        )
        .addIntegerOption((opt) =>
            opt
                .setName('xp_max')
                .setDescription('Maximum XP per message, from 6 to 45')
                .setRequired(true)
                .setMinValue(6)
                .setMaxValue(45)
        )
        .addBooleanOption((opt) =>
            opt
                .setName('leaderboard')
                .setDescription('Whether the leaderboard should be enabled')
                .setRequired(true)
        ),

    async execute(interaction) {
        const existingConfig = await getConfig(interaction.guild.id);
        if (existingConfig) {
            return interaction.reply({
                content: `Leveling is already configured for <#${existingConfig.level_channel}>. Use \`/level role\`, \`/level channel\`, \`/level rank\` or \`/level leaderboard\` to manage it. <:smirk2:1498272372539785286>`,
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('channel');
        const xpMin = interaction.options.getInteger('xp_min');
        const xpMax = interaction.options.getInteger('xp_max');
        const lbEnabled = interaction.options.getBoolean('leaderboard');

        if (!channel) {
            return interaction.reply({
                content: fail('Please choose a server text channel.'),
                flags: MessageFlags.Ephemeral
            });
        }

        if (xpMin >= xpMax) {
            return interaction.reply({
                content: fail('Minimum XP must be less than maximum XP.'),
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            await setConfig(interaction.guild.id, {
                levelChannel: channel.id,
                xpMin,
                xpMax,
                lbEnabled
            });

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('✅ Leveling Setup Complete')
                .addFields(
                    {
                        name: 'Level-up Channel',
                        value: `${channel}`,
                        inline: true
                    },
                    {
                        name: 'XP Range',
                        value: `${xpMin}–${xpMax} per message`,
                        inline: true
                    },
                    {
                        name: 'Leaderboard',
                        value: lbEnabled ? 'Enabled' : 'Disabled',
                        inline: true
                    }
                );

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: fail('Something went wrong saving the leveling settings. Try again in a moment.'),
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
