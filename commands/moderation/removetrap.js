const { PermissionsBitField } = require('discord.js');
const { removeTrapChannelConfig } = require('../../events/trapHelper');

module.exports = {
    name: 'removetrap',
    aliases: ['rmtrap'],
    description: 'Disables the configured trap channel.',
    async execute(message, args) {
        if (
            !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
            !message.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            message.author.id !== message.guild.ownerId
        ) {
            return message.reply('You need Manage Server permission to run this command.');
        }

        const shouldDelete = ['delete', 'del', 'removechannel', 'channel'].includes((args[0] ?? '').toLowerCase());

        const oldChannelId = await removeTrapChannelConfig(message.guild.id);

        if (!oldChannelId) {
            return message.reply('No trap channel was configured for this server.');
        }

        if (!shouldDelete) {
            return message.reply(
                `Trap system disabled. The old channel was <#${oldChannelId}>.\n` +
                'If you also want to delete the channel, run `,removetrap delete`.'
            );
        }

        const channel = message.guild.channels.cache.get(oldChannelId);
        if (!channel) {
            return message.reply('Trap system disabled. The configured channel no longer exists.');
        }

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply(
                `Trap system disabled, but I could not delete <#${oldChannelId}> because I lack Manage Channels.`
            );
        }

        await channel.delete(`Trap channel removed by ${message.author.tag}`);

        return message.reply('Trap system disabled and the trap channel was deleted.');
    },
};