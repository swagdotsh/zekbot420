const {
    SlashCommandBuilder,
    PermissionFlagsBits,
} = require('discord.js');

const CUSTOM_EMOJI_REGEX = /^<a?:\w+:(\d+)>$/;
const UNICODE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('react')
        .setDescription('Add a reaction to a message.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option
                .setName('emoji')
                .setDescription('The emoji to react with.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message_id')
                .setDescription('The ID of the message to react to.')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: 'You need the `Manage Messages` permission to use this command.',
                ephemeral: true,
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.AddReactions)) {
            return interaction.reply({
                content: 'I need the `Add Reactions` permission to do that.',
                ephemeral: true,
            });
        }

        const emojiInput = interaction.options.getString('emoji', true);
        const messageId = interaction.options.getString('message_id', true);

        const customEmojiMatch = emojiInput.match(CUSTOM_EMOJI_REGEX);

        if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emoji = interaction.guild.emojis.cache.get(emojiId);

            if (!emoji) {
                return interaction.reply({
                    content: `I can't add that emoji because it's not in ${interaction.guild.name}. <:smirk2:1498272372539785286>`,
                    ephemeral: true,
                });
            }
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
            await targetMessage.react(emojiInput);

            return interaction.reply({
                content: '✅ Reaction added.',
                ephemeral: true,
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: `I can't add that emoji because it's not in ${interaction.guild.name}. <:smirk2:1498272372539785286>`,
                ephemeral: true,
            });
        }
    },
};