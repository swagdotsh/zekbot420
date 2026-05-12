const { PermissionFlagsBits } = require('discord.js');

const CUSTOM_EMOJI_REGEX = /^<a?:\w+:(\d+)>$/;
const UNICODE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

module.exports = {
    name: 'removereact',
    aliases: ['rr', 'removereaction'],

    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need the `Manage Messages` permission to use this command. <:smirk2:1498272372539785286>');
        }

        const emojiInput = args[0];

        if (!emojiInput) {
            return message.reply(`Usage: \`${process.env.PREFIX || ','}removereact [emoji] [message ID]\` or reply to a message with \`${process.env.PREFIX || ','}removereact [emoji]\`.`);
        }

        const customEmojiMatch = emojiInput.match(CUSTOM_EMOJI_REGEX);
        let reactionKey = emojiInput;

        if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emoji = message.guild.emojis.cache.get(emojiId);

            if (!emoji) {
                return message.reply(`I can't remove that emoji because it's not in ${message.guild.name} <:smirk2:1498272372539785286>`);
            }

            reactionKey = emojiId;
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
                return message.reply(`Usage: \`${process.env.PREFIX || ','}removereact [emoji] [message ID]\` or reply to a message with \`${process.env.PREFIX || ','}removereact [emoji]\`.`);
            }

            try {
                targetMessage = await message.channel.messages.fetch(messageId);
            } catch {
                return message.reply('I could not find a message with that ID in this channel. <:smirk2:1498272372539785286>');
            }
        }

        try {
            const reaction =
                targetMessage.reactions.cache.get(reactionKey) ||
                targetMessage.reactions.cache.find((r) => r.emoji.toString() === emojiInput);

            if (!reaction) {
                return message.reply('That reaction is not on the message. <:smirk2:1498272372539785286>');
            }

            const users = await reaction.users.fetch();

            if (!users.has(message.client.user.id)) {
                return message.reply('I did not add that reaction to the message. <:smirk2:1498272372539785286>');
            }

            await reaction.users.remove(message.client.user.id);

            return message.react('✅').catch(() => {});
        } catch (err) {
            console.error(err);

            return message.reply('Failed to remove that reaction. <:smirk2:1498272372539785286>');
        }
    },
};