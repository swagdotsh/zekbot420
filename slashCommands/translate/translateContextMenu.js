const axios = require('axios');
const {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

const LIBRE_URL = 'https://translate.cutie.dating';
const API_KEY = process.env.LIBRETRANSLATE_KEY;

async function detectLanguage(text) {
    const res = await axios.post(`${LIBRE_URL}/detect`, {
        q: text,
        api_key: API_KEY
    });

    return res.data[0]?.language || 'auto';
}

async function translateText(text, source, target) {
    const res = await axios.post(`${LIBRE_URL}/translate`, {
        q: text,
        source,
        target,
        api_key: API_KEY
    });

    return res.data.translatedText;
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
                    text: `Message by ${message.author.tag}`
                });

            return interaction.editReply({
                embeds: [embed]
            });
        } catch (err) {
            console.error(err);

            return interaction.editReply({
                content: 'Translation failed. The service may be down or the language could not be detected.'
            });
        }
    }
};