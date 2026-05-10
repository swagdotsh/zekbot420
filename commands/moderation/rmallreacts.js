const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'removeallreacts',
    aliases: ['clearreacts', 'clearreactions', 'removeallreactions'],

    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need the `Manage Messages` permission to use this command. <:smirk2:1498272372539785286>');
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('I need the `Manage Messages` permission to remove all reactions. <:smirk2:1498272372539785286>');
        }

        let targetMessage;

        if (message.reference?.messageId) {
            try {
                targetMessage = await message.channel.messages.fetch(message.reference.messageId);
            } catch {
                return message.reply('I could not find the message you replied to. <:smirk2:1498272372539785286>');
            }
        } else {
            const messageId = args[0];

            if (!messageId) {
                return message.reply(`Usage: \`${process.env.PREFIX || ','}removeallreacts [message ID]\` or reply to a message with \`${process.env.PREFIX || ','}removeallreacts\`.`);
            }

            try {
                targetMessage = await message.channel.messages.fetch(messageId);
            } catch {
                return message.reply('I could not find a message with that ID in this channel. <:smirk2:1498272372539785286>');
            }
        }

        try {
            await targetMessage.reactions.removeAll();

            return message.react('✅').catch(() => {});
        } catch (err) {
            console.error(err);

            return message.reply('Failed to remove all reactions from that message. <:smirk2:1498272372539785286>');
        }
    },
};