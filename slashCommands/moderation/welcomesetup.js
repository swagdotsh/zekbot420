const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType,
    ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

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
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel');
        const guildDir = path.join(__dirname, '../../data', interaction.guild.id);
        const configPath = path.join(guildDir, 'welcomeConfig.json');

        try {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.channelId) {
                    return interaction.reply({
                        content: `Welcome messages are already configured in <#${config.channelId}>. Use \`/welcomesetup\` after removing the saved configuration if you need to change it. <:smirk2:1498272372539785286>`,
                        ephemeral: true
                    });
                }
            }

            fs.mkdirSync(guildDir, { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify({ channelId: channel.id }, null, 2));
            return interaction.reply({ content: `Welcome channel set to ${channel}.`, ephemeral: true });
        } catch (err) {
            console.error('[welcomesetup]', err);
            return interaction.reply({ content: 'Failed to save config: ' + err.message, ephemeral: true });
        }
    }
};
