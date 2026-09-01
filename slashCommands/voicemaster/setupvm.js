const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType,
    ChannelType
} = require('discord.js');
const { setupVoiceMaster } = require('./_vmManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupvm')
        .setDescription('Set up VoiceMaster in a category')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((opt) =>
            opt
                .setName('category')
                .setDescription('Category where the Join to Create VC should be created')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)
        ),

    async execute(interaction) {
        if (
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            interaction.user.id !== interaction.guild.ownerId
        ) {
            return interaction.reply({
                content: 'You do not have the required permissions to run this command. <:smirk2:1498272372539785286>',
                ephemeral: true
            });
        }

        return setupVoiceMaster(interaction);
    }
};
