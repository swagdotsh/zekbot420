const { detectLanguage, translateText } = require('../../libretranslate');
const {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    InteractionContextType,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Translate Message')
        .setType(ApplicationCommandType.Message)
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        ),

    async execute(interaction) {
        try {
            const message = interaction.targetMessage;
            const text = message.content?.trim();

            if (!text) {
                return interaction.reply({
                    content: 'That message has no text to translate.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            try {
                const source = await detectLanguage(text);
                const target = 'en';
                const translated = await translateText(text, source, target);

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setAuthor({ name: '🌐 Translation' })
                    .addFields(
                        {
                            name: `Original (${source})`,
                            value: text.slice(0, 1024)
                        },
                        {
                            name: `Translated (${target})`,
                            value: translated.slice(0, 1024)
                        }
                    )
                    .setFooter({
                        text: `Message by ${message.author?.tag ?? 'Unknown User'}`
                    });

                return interaction.editReply({
                    embeds: [embed]
                });
            } catch (err) {
                console.error('Translation execution error:', err);

                return interaction.editReply({
                    content: 'Translation failed. The service may be down or the language could not be detected.'
                });
            }
        } catch (outerErr) {
            console.error('Outer error in translate command:', outerErr);

            // Try to reply if interaction hasn't been replied to
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: 'An error occurred while processing your request.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};
