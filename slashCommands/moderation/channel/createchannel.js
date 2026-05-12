const {
    ChannelType,
    PermissionFlagsBits,
    PermissionsBitField,
    SlashCommandBuilder,
    InteractionContextType,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createchannel')
        .setDescription('Quickly create a text channel.')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('The name of the channel to create.')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('category')
                .setDescription('The category where the channel should be created.')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false)
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('The only role that should be able to access the channel. Makes it private.')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true,
            });
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'You need the `Manage Channels` permission to use this command.',
                ephemeral: true,
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'I need the `Manage Channels` permission to create channels.',
                ephemeral: true,
            });
        }

        const channelName = interaction.options.getString('name', true);
        const category = interaction.options.getChannel('category');
        const role = interaction.options.getRole('role');

        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
        };

        if (category) {
            channelOptions.parent = category.id;
        }

        if (role) {
            channelOptions.permissionOverwrites = [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: role.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                },
                {
                    id: interaction.guild.members.me.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                },
            ];
        }

        try {
            const channel = await interaction.guild.channels.create(channelOptions);

            return interaction.reply({
                content:
                    `✅ Created ${channel}` +
                    `${category ? ` in **${category.name}**` : ''}` +
                    `${role ? ` and made it private for ${role}` : ''}.`,
            });
        } catch (error) {
            console.error(error);

            return interaction.reply({
                content: 'Failed to create the channel.',
                ephemeral: true,
            });
        }
    },
};