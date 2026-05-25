const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType
} = require('discord.js');

const BOT_DEVELOPERS = [
    '495635279387033603',
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('echo')
        .setDescription('Make the bot say something')
        .setIntegrationTypes(0, 1)
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption((opt) =>
            opt
                .setName('text')
                .setDescription('What the bot should say')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('Server channel to send the message in')
                .setRequired(false)
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
        ),

    async execute(interaction) {
        const text = interaction.options.getString('text', true);
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (interaction.guild) {
            const isBotDeveloper = BOT_DEVELOPERS.includes(interaction.user.id);
            const canManageServer = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!canManageServer && !isBotDeveloper) {
                return interaction.reply({
                    content: 'You need **Manage Server** to use this command.',
                    ephemeral: true
                });
            }

            if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
                return interaction.reply({
                    content: 'Please choose a server text channel.',
                    ephemeral: true
                });
            }

            await channel.send(text);

            return interaction.reply({
                content: `Sent your echo in ${channel}.`,
                ephemeral: true
            });
        }

        return interaction.reply({
            content: text,
            allowedMentions: {
                parse: []
            }
        });
    }
};