const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType
} = require('discord.js');
const { setLevelChannel } = require('../../leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lvlchannel')
        .setDescription('Set the channel for level-up announcements')
        .setContexts(InteractionContextType.Guild)
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
                ephemeral: true
            });
        }

        try {
            await setLevelChannel(interaction.guild.id, channel.id);

            return interaction.reply({
                content: `Level-up announcements will now be sent to ${channel}.`,
                ephemeral: true
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Something went wrong updating the channel.',
                ephemeral: true
            });
        }
    }
};