const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { setConfig } = require('../../leveling');

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
        const channel = interaction.options.getChannel('channel');
        const xpMin = interaction.options.getInteger('xp_min');
        const xpMax = interaction.options.getInteger('xp_max');
        const lbEnabled = interaction.options.getBoolean('leaderboard');

        if (!channel) {
            return interaction.reply({
                content: 'Invalid channel.',
                ephemeral: true
            });
        }

        if (xpMin >= xpMax) {
            return interaction.reply({
                content: 'Invalid XP range. Minimum XP must be less than maximum XP.',
                ephemeral: true
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
                ephemeral: true
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Something went wrong saving the config.',
                ephemeral: true
            });
        }
    }
};