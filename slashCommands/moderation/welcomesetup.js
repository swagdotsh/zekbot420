const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    MessageFlags
} = require('discord.js');
const { getWelcomeConfig, updateWelcomeConfig } = require('../../welcomeStore');
const { ok, fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcomesetup')
        .setDescription('Set the channel where new members are welcomed')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('Channel to send welcome messages in')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel', true);
        const perms = channel.permissionsFor(interaction.guild.members.me);
        if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            return interaction.reply({
                content: fail(`I need the \`View Channel\`, \`Send Messages\` and \`Embed Links\` permissions in ${channel}.`),
                flags: MessageFlags.Ephemeral,
            });
        }

        await updateWelcomeConfig(interaction.guild.id, (config) => {
            config.channelId = channel.id;
        });

        return interaction.reply({
            content: ok(`Welcome messages will be sent in ${channel}. Customize them with \`/welcome edit\` and preview with \`/welcome test\`.`),
            flags: MessageFlags.Ephemeral,
        });
    },

    async runDisable(interaction) {
        const current = await getWelcomeConfig(interaction.guild.id);
        if (!current.channelId) {
            return interaction.reply({ content: fail('Welcome messages are not set up in this server.'), flags: MessageFlags.Ephemeral });
        }

        await updateWelcomeConfig(interaction.guild.id, (config) => {
            config.channelId = null;
        });

        return interaction.reply({
            content: ok('Welcome messages are off. Your custom message is saved for when you run `/setup welcome` again.'),
            flags: MessageFlags.Ephemeral,
        });
    },
};
