const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType,
    ChannelType,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('../../jsonStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcomesetup')
        .setDescription('Set the welcome channel for this server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('Channel to send welcome messages in')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: 'You need the Manage Server permission to use this command. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('channel');
        const guildDir = path.join(__dirname, '../../data', interaction.guild.id);
        const configPath = path.join(guildDir, 'welcomeConfig.json');

        try {
            fs.mkdirSync(guildDir, { recursive: true });
            await writeJsonAtomic(configPath, { channelId: channel.id });
            return interaction.reply({ content: `Welcome channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error('[welcomesetup]', err);
            return interaction.reply({ content: 'Failed to save config: ' + err.message, flags: MessageFlags.Ephemeral });
        }
    }
};
