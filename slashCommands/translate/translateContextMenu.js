const axios = require('axios');
const {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

const LIBRE_URL = 'https://translate.cutie.dating';
const REQUEST_TIMEOUT = 8000; // 8 second timeout

async function detectLanguage(text) {
    try {
        const res = await axios.post(`${LIBRE_URL}/detect`, {
            q: text
        }, {
            timeout: REQUEST_TIMEOUT
        });

        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('Invalid detection response');
        }

        return res.data[0]?.language || 'auto';
    } catch (error) {
        console.error('Language detection error:', error.message);
        throw error;
    }
}

async function translateText(text, source, target) {
    try {
        const res = await axios.post(`${LIBRE_URL}/translate`, {
            q: text,
            source,
            target
        }, {
            timeout: REQUEST_TIMEOUT
        });

        if (!res.data || !res.data.translatedText) {
            throw new Error('Invalid translation response');
        }

        return res.data.translatedText;
    } catch (error) {
        console.error('Translation error:', error.message);
        throw error;
    }
}

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
            console.log('Interaction received:', interaction.type, interaction.commandName);
            console.log(`Running context menu command: ${interaction.commandName}`);

            const message = interaction.targetMessage;
            const text = message.content?.trim();

            if (!text) {
                return interaction.reply({
                    content: 'That message has no text to translate.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({
                ephemeral: true
            });

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
                    ephemeral: true
                });
            }
        }
    }
};