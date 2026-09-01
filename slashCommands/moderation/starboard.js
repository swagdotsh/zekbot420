const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ComponentType,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { deleteConfig, readConfig, updateConfig } = require('../../starboardHandler');

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
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'You need the `Manage Server` permission to configure the starboard. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const existingConfig = await readConfig(interaction.guild.id);

        if (subcommand === 'off') {
            if (!existingConfig.channelId) {
                return interaction.reply({
                    content: 'Starboard is not configured for this server. Use `/starboard set` to configure it. <:smirk2:1498272372539785286>',
                    ephemeral: true,
                });
            }

            const confirmId = `starboard-off:${interaction.guild.id}:${interaction.user.id}`;
            await interaction.reply({
                content: 'This will delete this server\'s saved starboard configuration. Already-posted starboard messages will stay. Continue?',
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(confirmId)
                            .setLabel('Confirm')
                            .setStyle(ButtonStyle.Danger)
                    ),
                ],
                ephemeral: true,
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
                    content: 'Starboard has been turned off and its saved configuration was deleted.',
                    components: [],
                });
            } catch {
                return interaction.editReply({
                    content: 'Starboard shutdown cancelled.',
                    components: [],
                }).catch(() => null);
            }
        }

        if (existingConfig.channelId) {
            return interaction.reply({
                content: `Starboard is already configured in <#${existingConfig.channelId}>. Use \`/starboardthreshold\`, \`/starboardself\`, or \`/staremoji\` to manage it. Use \`/starboard off\` to remove it. <:smirk2:1498272372539785286>`,
                ephemeral: true,
            });
        }

        const channel = interaction.options.getChannel('channel');
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
            return interaction.reply({
                content: 'Choose a server text channel for the starboard.',
                ephemeral: true,
            });
        }

        await updateConfig(interaction.guild.id, (config) => {
            config.channelId = channel.id;
        });

        return interaction.reply({
            content: `Starboard channel set to ${channel}.`,
            ephemeral: true,
        });
    },
};
