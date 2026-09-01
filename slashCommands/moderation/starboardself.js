const {
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { updateConfig } = require('../../starboardHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starboardself')
        .setDescription('Choose whether users can star their own messages')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption((option) =>
            option
                .setName('enabled')
                .setDescription('Whether self-stars count toward starboard')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'You need the `Manage Server` permission to configure the starboard. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const allowSelf = interaction.options.getBoolean('enabled', true);
        await updateConfig(interaction.guild.id, (config) => {
            config.allowSelf = allowSelf;
        });

        return interaction.reply({
            content: `Self-stars are now ${allowSelf ? 'allowed' : 'not counted'} for the starboard.`,
            ephemeral: true,
        });
    },
};
