const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { setJailConfig } = require('../../../jailHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupjail')
        .setDescription('Set up the jail system')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const guild = interaction.guild;

        let jailRole = guild.roles.cache.find((r) => r.name === 'Jailed');

        if (!jailRole) {
            jailRole = await guild.roles.create({
                name: 'Jailed',
                color: 0x808080,
                reason: 'zekbot420 jail setup'
            });
        }

        let jailChannel = guild.channels.cache.find((c) => c.name === 'jail');

        if (!jailChannel) {
            jailChannel = await guild.channels.create({
                name: 'jail',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: ['ViewChannel']
                    },
                    {
                        id: jailRole.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        deny: ['AddReactions', 'AttachFiles', 'EmbedLinks']
                    }
                ],
                reason: 'zekbot420 jail setup'
            });
        }

        const channels = guild.channels.cache.filter((c) =>
            c.id !== jailChannel.id &&
            (
                c.type === ChannelType.GuildText ||
                c.type === ChannelType.GuildVoice ||
                c.type === ChannelType.GuildCategory
            )
        );

        for (const [, channel] of channels) {
            await channel.permissionOverwrites.edit(jailRole, {
                ViewChannel: false
            }).catch(() => {});
        }

        await setJailConfig(guild.id, jailChannel.id, jailRole.id);

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🔒 Jail Setup Complete')
            .addFields(
                { name: 'Jail Channel', value: `<#${jailChannel.id}>`, inline: true },
                { name: 'Jail Role', value: `<@&${jailRole.id}>`, inline: true },
                { name: 'Channels Restricted', value: `${channels.size}`, inline: true }
            );

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};