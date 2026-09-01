const { PermissionFlagsBits } = require('discord.js');

const CUSTOM_EMOJI_REGEX = /^<a?:\w+:(\d+)>$/;
const UNICODE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

module.exports = {
    name: 'react',
    aliases: ['addreact', 'r'],

    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need the `Manage Messages` permission to use this command. <:smirk2:1498272372539785286>');
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.AddReactions)) {
            return message.reply('I need the `Add Reactions` permission to do that. <:smirk2:1498272372539785286>');
        }

        const emojiInput = args[0];

        if (!emojiInput) {
            return message.reply(`Usage: \`${process.env.PREFIX || ','}react [emoji] [message ID]\` or reply to a message with \`${process.env.PREFIX || ','}react [emoji]\`.`);
        }

        const customEmojiMatch = emojiInput.match(CUSTOM_EMOJI_REGEX);

        if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emoji = message.guild.emojis.cache.get(emojiId);

            if (!emoji) {
                return message.reply(`I can't add that emoji because it's not in ${message.guild.name}. <:smirk2:1498272372539785286>`);
            }
        } else if (!UNICODE_EMOJI_REGEX.test(emojiInput)) {
            return message.reply('That does not look like a valid emoji. <:smirk2:1498272372539785286>');
        }

        let targetMessage;

        if (message.reference?.messageId) {
            try {
                targetMessage = await message.channel.messages.fetch(message.reference.messageId);
            } catch {
                return message.reply('I could not find the message you replied to. <:smirk2:1498272372539785286>');
            }
        } else {
            const messageId = args[1];

            if (!messageId) {
                return message.reply(`Usage: \`${process.env.PREFIX || ','}react [emoji] [message ID]\` or reply to a message with \`${process.env.PREFIX || ','}react [emoji]\`.`);
            }

            try {
                targetMessage = await message.channel.messages.fetch(messageId);
            } catch {
                return message.reply('I could not find a message with that ID in this channel. <:smirk2:1498272372539785286>');
            }
        }

        try {
            await targetMessage.react(emojiInput);
            return message.react('✅').catch(() => {});
        } catch (err) {
            console.error(err);

            return message.reply(`I can't add that emoji because it's not in ${message.guild.name}. <:smirk2:1498272372539785286>`);
        }
    },
};
