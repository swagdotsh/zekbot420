const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    MessageFlags
} = require('discord.js');
const { ok, fail } = require('../../../ui');
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
                content: 'Cancelled. Set `confirm` to True to remove the jail system.',
                flags: MessageFlags.Ephemeral
            });
        }

        const guild = interaction.guild;
        const config = await getJailConfig(guild.id);

        if (!config) {
            return interaction.reply({
                content: fail('The jail system is not set up in this server.'),
                flags: MessageFlags.Ephemeral
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
            content: ok('The jail system has been removed.'),
            flags: MessageFlags.Ephemeral
        });
    }
};