const axios = require('axios');
const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

const LIBRE_URL = 'https://translate.cutie.dating';
const API_KEY = process.env.LIBRETRANSLATE_KEY;

const POSSIBLE_LANGS = ['af','ar','az','bg','bn','ca','cs','cy','da','de','el','en','eo','es','et','fa','fi','fr','ga','gl','gu','he','hi','hr','ht','hu','id','it','ja','ka','kn','ko','lt','lv','mk','ml','mr','ms','mt','nl','no','pl','pt','ro','ru','sk','sl','sq','sr','sv','sw','ta','te','tg','th','tl','tr','uk','ur','uz','vi','zh'];

async function translateWord(word, source, target) {
    const res = await axios.post(`${LIBRE_URL}/translate`, {
        q: word,
        source,
        target,
        api_key: API_KEY
    });

    return res.data.translatedText;
}

function splitText(text) {
    return text.match(/\S+\s*/g) || [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('badtranslate')
        .setDescription('Badly translate text word-by-word')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption((opt) =>
            opt
                .setName('source')
                .setDescription('Source language code, example: en')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('destination')
                .setDescription('Destination language code, example: fr')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('text')
                .setDescription('The text to badly translate')
                .setRequired(true)
                .setMaxLength(1000)
        ),

    async execute(interaction) {
        const source = interaction.options.getString('source')?.toLowerCase();
        const target = interaction.options.getString('destination')?.toLowerCase();
        const text = interaction.options.getString('text')?.trim();

        if (!text) {
            return interaction.reply({
                content: 'No text to mangle.',
                ephemeral: true
            });
        }

        if (!POSSIBLE_LANGS.includes(source)) {
            return interaction.reply({
                content: `Invalid source language code: \`${source}\``,
                ephemeral: true
            });
        }

        if (!POSSIBLE_LANGS.includes(target)) {
            return interaction.reply({
                content: `Invalid destination language code: \`${target}\``,
                ephemeral: true
            });
        }

        const words = text.trim().split(/\s+/);
        if (words.length > 30) {
            return interaction.reply({
                content: 'Keep it under 30 words please!',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const pieces = splitText(text);

            const mangledPieces = await Promise.all(
                pieces.map(async (piece) => {
                    const match = piece.match(/^(\S+)(\s*)$/);
                    if (!match) return piece;

                    const word = match[1];
                    const spacing = match[2];

                    const translated = await translateWord(word, source, target).catch(() => word);
                    return translated + spacing;
                })
            );

            const mangled = mangledPieces.join('');

            const embed = new EmbedBuilder()
                .setColor(0xff6b6b)
                .setAuthor({ name: '🤓 Bad Translation' })
                .addFields(
                    { name: `Original (${source})`, value: text.slice(0, 1024) },
                    { name: `Bad (${target})`, value: mangled.slice(0, 1024) }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Bad translate failed:', err.response?.data || err.message || err);

            return interaction.editReply({
                content: 'Something went wrong while mangling. The language code might be invalid or the service is down.'
            });
        }
    }
};