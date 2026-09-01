const {
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { updateConfig } = require('../../starboardHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starboardthreshold')
        .setDescription('Set how many stars a message needs for starboard')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption((option) =>
            option
                .setName('stars')
                .setDescription('Number of stars required, from 1 to 1000')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000)
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'You need the `Manage Server` permission to configure the starboard. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const threshold = interaction.options.getInteger('stars', true);
        await updateConfig(interaction.guild.id, (config) => {
            config.threshold = threshold;
        });

        return interaction.reply({
            content: `Starboard threshold set to ${threshold} star${threshold === 1 ? '' : 's'}.`,
            ephemeral: true,
        });
    },
};
