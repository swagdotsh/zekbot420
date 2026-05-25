const {
    SlashCommandBuilder,
    PermissionFlagsBits,
} = require('discord.js');

const CUSTOM_EMOJI_REGEX = /^<a?:\w+:(\d+)>$/;
const UNICODE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removereact')
        .setDescription('Remove one of the bot reactions from a message.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option
                .setName('emoji')
                .setDescription('The emoji reaction to remove.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message_id')
                .setDescription('The ID of the message to remove the reaction from.')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: 'You need the `Manage Messages` permission to use this command. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const emojiInput = interaction.options.getString('emoji', true);
        const messageId = interaction.options.getString('message_id', true);

        const customEmojiMatch = emojiInput.match(CUSTOM_EMOJI_REGEX);
        let reactionKey = emojiInput;

        if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emoji = interaction.guild.emojis.cache.get(emojiId);

            if (!emoji) {
                return interaction.reply({
                    content: `I can't remove that emoji because it's not in ${interaction.guild.name} <:smirk2:1498272372539785286>`,
                    ephemeral: true,
                });
            }

            reactionKey = emojiId;
        } else if (!UNICODE_EMOJI_REGEX.test(emojiInput)) {
            return interaction.reply({
                content: 'That does not look like a valid emoji. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        let targetMessage;

        try {
            targetMessage = await interaction.channel.messages.fetch(messageId);
        } catch {
            return interaction.reply({
                content: 'I could not find a message with that ID in this channel. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        try {
            const reaction =
                targetMessage.reactions.cache.get(reactionKey) ||
                targetMessage.reactions.cache.find(r => r.emoji.toString() === emojiInput);

            if (!reaction) {
                return interaction.reply({
                    content: 'That reaction is not on the message. <:smirk2:1498272372539785286>',
                    ephemeral: true,
                });
            }

            const users = await reaction.users.fetch();

            if (!users.has(interaction.client.user.id)) {
                return interaction.reply({
                    content: 'I did not add that reaction to the message. <:smirk2:1498272372539785286>',
                    ephemeral: true,
                });
            }

            await reaction.users.remove(interaction.client.user.id);

            return interaction.reply({
                content: '✅ Reaction removed.',
                ephemeral: true,
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Failed to remove that reaction. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }
    },
};