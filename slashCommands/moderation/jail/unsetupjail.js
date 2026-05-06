const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType
} = require('discord.js');
const { getJailConfig, deleteJailConfig } = require('../../../jailHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsetupjail')
        .setDescription('Remove the jail system from this server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption((opt) =>
            opt
                .setName('confirm')
                .setDescription('Confirm that you want to remove the jail role/channel/config')
                .setRequired(true)
        ),

    async execute(interaction) {
        const confirmed = interaction.options.getBoolean('confirm');

        if (!confirmed) {
            return interaction.reply({
                content: 'Jail unsetup cancelled.',
                ephemeral: true
            });
        }

        const guild = interaction.guild;
        const config = await getJailConfig(guild.id);

        if (!config) {
            return interaction.reply({
                content: 'Jail system is not set up in this server.',
                ephemeral: true
            });
        }

        const jailRole = guild.roles.cache.get(config.jail_role_id);
        const jailChannel = guild.channels.cache.get(config.jail_channel_id);

        if (jailRole) {
            const channels = guild.channels.cache.filter((c) =>
                c.type === ChannelType.GuildText ||
                c.type === ChannelType.GuildVoice ||
                c.type === ChannelType.GuildCategory
            );

            for (const [, channel] of channels) {
                await channel.permissionOverwrites.delete(jailRole).catch(() => {});
            }

            await jailRole.delete('zekbot420 jail unsetup').catch(() => {});
        }

        if (jailChannel) {
            await jailChannel.delete('zekbot420 jail unsetup').catch(() => {});
        }

        await deleteJailConfig(guild.id);

        return interaction.reply({
            content: '✅ Jail system has been removed.',
            ephemeral: true
        });
    }
};