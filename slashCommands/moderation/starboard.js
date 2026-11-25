const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ComponentType,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');
const { deleteConfig, readConfig, updateConfig } = require('../../starboardHandler');
const { ok, fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Configure or disable the starboard')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('set')
                .setDescription('Set the channel where starred messages appear')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('The starboard channel')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('off')
                .setDescription('Disable starboard and delete its saved configuration')
        ),

    async execute(interaction) {
        return interaction.options.getSubcommand() === 'off' ? this.runOff(interaction) : this.runSet(interaction);
    },

    async runOff(interaction) {
        const existingConfig = await readConfig(interaction.guild.id);
        if (!existingConfig.channelId) {
            return interaction.reply({
                content: fail('Starboard is not set up in this server. Use `/setup starboard` to set it up.'),
                flags: MessageFlags.Ephemeral,
            });
        }

        const confirmId = `starboard-off:${interaction.guild.id}:${interaction.user.id}`;
        await interaction.reply({
            content: 'This will delete this server\'s saved starboard settings. Messages already on the starboard will stay. Continue?',
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(confirmId)
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Danger)
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        const confirmationMessage = await interaction.fetchReply();
        try {
            const confirmation = await confirmationMessage.awaitMessageComponent({
                componentType: ComponentType.Button,
                time: 30_000,
                filter: (buttonInteraction) =>
                    buttonInteraction.customId === confirmId && buttonInteraction.user.id === interaction.user.id,
            });

            await deleteConfig(interaction.guild.id);
            return confirmation.update({
                content: ok('Starboard has been disabled and its settings were deleted.'),
                components: [],
            });
        } catch {
            return interaction.editReply({
                content: 'Cancelled. Starboard is still on.',
                components: [],
            }).catch(() => null);
        }
    },

    async runSet(interaction) {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
            return interaction.reply({
                content: fail('Choose a server text channel for the starboard.'),
                flags: MessageFlags.Ephemeral,
            });
        }

        const existingConfig = await readConfig(interaction.guild.id);
        await updateConfig(interaction.guild.id, (config) => {
            config.channelId = channel.id;
        });

        const moved = existingConfig.channelId && existingConfig.channelId !== channel.id
            ? ` (moved from <#${existingConfig.channelId}>)`
            : '';
        return interaction.reply({
            content: ok(`Starboard channel set to ${channel}${moved}. Tweak it with \`/starboard threshold\`, \`/starboard emoji\`, and \`/starboard selfstar\`.`),
            flags: MessageFlags.Ephemeral,
        });
    },
};
