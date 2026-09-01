const { PermissionFlagsBits } = require('discord.js');
const { parseReactionEmoji, updateConfig } = require('../../starboardHandler');

module.exports = {
    name: 'staremoji',

    async execute(message, args) {
        if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('You need the `Manage Server` permission to configure the starboard.');
        }

        const emoji = parseReactionEmoji(args.join(' '));
        if (!emoji) {
            return message.reply('Provide one standard or custom emoji. Example: `,staremoji ⭐` or `,staremoji <:star:123456789012345678>`');
        }

        await updateConfig(message.guild.id, (config) => {
            config.reactionEmoji = emoji;
        });

        const display = emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
        return message.reply(`Starboard reactions are now counted with ${display}.`);
    },
};
