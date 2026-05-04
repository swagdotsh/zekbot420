const axios = require('axios');
const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

const LIBRE_URL = 'https://translate.cutie.dating';
const API_KEY = process.env.LIBRETRANSLATE_KEY;

const POSSIBLE_LANGS = [
    'af', 'ar', 'az', 'bg', 'bn', 'ca', 'cs', 'cy', 'da', 'de',
    'el', 'en', 'eo', 'es', 'et', 'fa', 'fi', 'fr', 'ga', 'gl',
    'gu', 'he', 'hi', 'hr', 'ht', 'hu', 'id', 'it', 'ja', 'ka',
    'kn', 'ko', 'lt', 'lv', 'mk', 'ml', 'mr', 'ms', 'mt', 'nl',
    'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv',
    'sw', 'ta', 'te', 'tg', 'th', 'tl', 'tr', 'uk', 'ur', 'uz',
    'vi', 'zh'
];

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
    data: new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text to another language')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption((opt) =>
            opt
                .setName('text')
                .setDescription('The text to translate')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('target')
                .setDescription('Language to translate to, for example en, es, fr, ja')
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName('source')
                .setDescription('Source language, or leave blank for auto-detect')
                .setRequired(false)
        ),

    async execute(interaction) {
        const text = interaction.options.getString('text')?.trim();
        let target = interaction.options.getString('target')?.toLowerCase() || 'en';
        let source = interaction.options.getString('source')?.toLowerCase() || 'auto';

        if (!text) {
            return interaction.reply({
                content: 'No text to translate.',
                ephemeral: true
            });
        }

        if (source !== 'auto' && !POSSIBLE_LANGS.includes(source)) {
            return interaction.reply({
                content: `Invalid source language code: \`${source}\`.`,
                ephemeral: true
            });
        }

        if (!POSSIBLE_LANGS.includes(target)) {
            return interaction.reply({
                content: `Invalid target language code: \`${target}\`.`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            if (source === 'auto') {
                source = await detectLanguage(text);
            }

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
                );

            return interaction.editReply({
                embeds: [embed]
            });
        } catch (err) {
            console.error(err);

            return interaction.editReply({
                content: 'Translation failed. The language code might be invalid or the service is down.'
            });
        }
    }
};