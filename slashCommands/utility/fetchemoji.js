const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fetchemoji')
        .setDescription('Fetch the raw image file for a custom Discord emoji')
        .addStringOption((option) =>
            option
                .setName('emoji')
                .setDescription('The custom Discord emoji to fetch')
                .setRequired(true)
        ),

    async execute(interaction) {
        const input = interaction.options.getString('emoji', true);

        const match = input.match(/^<a?:\w+:(\d+)>$/);

        if (!match) {
            return interaction.reply({
                content:
                    'Please provide a custom Discord emoji, like `<:name:id>` or `<a:name:id>`.\n' +
                    'Default Unicode emojis like 😭 or 🔥 will not work here, but you can get them from <https://emojipedia.org/>',
                ephemeral: true,
            });
        }

        const isAnimated = input.startsWith('<a:');
        const emojiId = match[1];
        const extension = isAnimated ? 'gif' : 'png';
        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?quality=lossless`;

        const attachment = new AttachmentBuilder(emojiUrl, {
            name: `emoji.${extension}`,
        });

        return interaction.reply({
            files: [attachment],
        });
    },
};