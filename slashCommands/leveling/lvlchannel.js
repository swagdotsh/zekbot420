const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    MessageFlags
} = require('discord.js');
const { setLevelChannel } = require('../../leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lvlchannel')
        .setDescription('Set the channel for level-up announcements')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('The channel where level-up announcements should be sent')
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        if (!channel) {
            return interaction.reply({
                content: 'Please provide a valid channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            await setLevelChannel(interaction.guild.id, channel.id);

            return interaction.reply({
                content: `Level-up announcements will now be sent to ${channel}.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Something went wrong updating the channel.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};