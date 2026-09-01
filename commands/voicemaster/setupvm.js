const { PermissionsBitField } = require('discord.js');
const { setupVoiceMaster } = require('./vmManager');

module.exports = {
    name: 'setupvm',
    aliases: ['setupvoicemaster'],
    async execute(message) {
        if (
            !message.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            message.author.id !== message.guild.ownerId
        ) {
            return message.reply('You do not have the required permissions to run this command. <:smirk2:1498272372539785286>');
        }

        return setupVoiceMaster(message);
    },
};
