const { getUserVoice, setUserVoice, findVoice, formatVoiceList } = require('../../ttsHandler');

module.exports = {
    name: 'ttsvoice',
    aliases: ['ttsv'],
    async execute(message, args) {
        try {
            if (!args[0]) {
                const voice = await getUserVoice(message.author.id);
                return message.reply(`Your TTS voice: **${voice}**\n-# \`${process.env.PREFIX}ttsvoice list [locale]\` to see voices, \`${process.env.PREFIX}ttsvoice <name>\` to change yours.`);
            }

            if (args[0].toLowerCase() === 'list') {
                return message.reply(await formatVoiceList(args[1]));
            }

            const voice = await findVoice(args[0]);
            if (!voice) return message.reply(`No voice called **${args[0]}**. Use \`${process.env.PREFIX}ttsvoice list\` to see them.`);

            await setUserVoice(message.author.id, voice);
            return message.reply(`Your TTS voice is now **${voice}**.`);
        } catch (err) {
            console.error('ttsvoice command failed:', err);
            return message.reply("Couldn't get or set your TTS voice. <:smirk2:1498272372539785286>");
        }
    }
};
