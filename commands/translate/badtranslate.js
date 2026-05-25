const axios = require('axios');

const LIBRE_URL = 'https://translate.cutie.dating';
const API_KEY = process.env.LIBRETRANSLATE_KEY;

const POSSIBLE_LANGS = ['af','ar','az','bg','bn','ca','cs','cy','da','de','el','en','eo','es','et','fa','fi','fr','ga','gl','gu','he','hi','hr','ht','hu','id','it','ja','ka','kn','ko','lt','lv','mk','ml','mr','ms','mt','nl','no','pl','pt','ro','ru','sk','sl','sq','sr','sv','sw','ta','te','tg','th','tl','tr','uk','ur','uz','vi','zh'];

async function detectLanguage(text) {
    const res = await axios.post(`${LIBRE_URL}/detect`, {
        q: text,
        api_key: API_KEY
    });

    return res.data[0]?.language || 'auto';
}

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
    name: 'badtranslate',
    aliases: ['bt'],
    async execute(message, args) {
        const reply = message.reference
            ? await message.channel.messages.fetch(message.reference.messageId)
            : null;

        let source = 'auto';
        let target = 'en';
        let text = null;

        if (reply && args.length === 0) {
            text = reply.content;
        } else if (reply && args.length === 1) {
            target = args[0].toLowerCase();
            text = reply.content;
        } else if (reply && args.length >= 2) {
            source = args[0].toLowerCase();
            target = args[1].toLowerCase();
            text = reply.content;
        } else if (!reply && args.length >= 3) {
            source = args[0].toLowerCase();
            target = args[1].toLowerCase();
            text = args.slice(2).join(' ');
        } else if (!reply && args.length >= 1) {
            text = args.join(' ');
        } else {
            return message.reply('Usage:\n`,badtranslate [text]`\n`,badtranslate [source] [dest] [text]`\n`,badtranslate` (reply)\n`,badtranslate [dest]` (reply)\n`,badtranslate [source] [dest]` (reply)');
        }

        if (!text) return message.reply('No text to badly translate. <:smirk2:1498272372539785286>');

        if (source !== 'auto' && !POSSIBLE_LANGS.includes(source)) {
            return message.reply(`Invalid source language code: \`${source}\``);
        }

        if (!POSSIBLE_LANGS.includes(target)) {
            return message.reply(`Invalid destination language code: \`${target}\``);
        }

        const words = text.trim().split(/\s+/);
        if (words.length > 30) return message.reply('Keep it under 30 words please! <:smirk2:1498272372539785286>');

        const loadingMsg = await message.channel.send('<a:spinbot420:1498959085427490937> Badly translating your message...');

        try {
            if (source === 'auto') source = await detectLanguage(text);

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

            await loadingMsg.delete().catch(() => {});

            await message.reply({
                embeds: [{
                    color: 0xff6b6b,
                    author: { name: '🤓 Bad Translation' },
                    fields: [
                        { name: `Original (${source})`, value: text.slice(0, 1024) },
                        { name: `Bad (${target})`, value: mangled.slice(0, 1024) }
                    ]
                }]
            });
        } catch (err) {
            console.error('Bad translate failed:', err.response?.data || err.message || err);
            await loadingMsg.delete().catch(() => {});
            await message.reply('Something went wrong while mangling. The language code might be invalid or the service is down. <:smirk2:1498272372539785286>');
        }
    }
};