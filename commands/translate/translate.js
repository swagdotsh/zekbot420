const { currentPrefix } = require('../../prefix');
const { detectLanguage, translateText } = require('../../libretranslate');

module.exports = {
    name: 'translate',
    cooldown: 4,
    aliases: ['tr'],
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
        } else if (!reply && args.length >= 2) {
            const possibleLangs = ['af','ar','az','bg','bn','ca','cs','cy','da','de','el','en','eo','es','et','fa','fi','fr','ga','gl','gu','he','hi','hr','ht','hu','id','it','ja','ka','kn','ko','lt','lv','mk','ml','mr','ms','mt','nl','no','pl','pt','ro','ru','sk','sl','sq','sr','sv','sw','ta','te','tg','th','tl','tr','uk','ur','uz','vi','zh'];
            if (possibleLangs.includes(args[0].toLowerCase()) && possibleLangs.includes(args[1].toLowerCase())) {
                source = args[0].toLowerCase();
                target = args[1].toLowerCase();
                text = args.slice(2).join(' ');
            } else {
                target = args[0].toLowerCase();
                text = args.slice(1).join(' ');
            }
        } else {
            return message.reply(`Usage: \`${currentPrefix()}translate\` (reply) • \`${currentPrefix()}translate [lang]\` (reply) • \`${currentPrefix()}translate [lang] [text]\` • \`${currentPrefix()}translate [source] [dest] [text]\``);
        }

        if (!text) return message.reply('No text to translate.');

        try {
            if (source === 'auto') source = await detectLanguage(text);
            const translated = await translateText(text, source, target);

            await message.reply({
                embeds: [{
                    color: 0x5865f2,
                    author: { name: '🌐 Translation' },
                    fields: [
                        { name: `Original (${source})`, value: text },
                        { name: `Translated (${target})`, value: translated }
                    ]
                }]
            });
        } catch (err) {
            console.error(err);
            await message.reply('Translation failed. The language code might be invalid or the service is down.');
        }
    }
};