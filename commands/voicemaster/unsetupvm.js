const { PermissionsBitField } = require('discord.js');
const { unsetupVoiceMaster } = require('./vmManager');

module.exports = {
    name: 'unsetupvm',
    aliases: ['removevm', 'disablevm', 'unsetupvoicemaster'],
    async execute(message) {
        if (
            !message.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            message.author.id !== message.guild.ownerId
        ) {
            return message.reply('You do not have the required permissions to run this command.');
        }

        await message.reply(
            'Are you sure you want to unsetup VoiceMaster?\n' +
            'This will delete the `Join to create` channel and remove the saved VoiceMaster config.\n' +
            'Reply with `confirm` within 30 seconds to continue.'
        );

        const collected = await message.channel.awaitMessages({
            filter: function(response) { return response.author.id === message.author.id },
            max: 1,
            time: 30_000,
            errors: ['time'],
        }).catch(() => null);

        const response = collected?.first();

        if (!response || response.content.trim().toLowerCase() !== 'confirm') {
            return message.reply('VoiceMaster unsetup cancelled.');
        }

        return unsetupVoiceMaster(message);
    },
};