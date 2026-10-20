const { startTts } = require('../../ttsHandler');

module.exports = {
    name: 'jointts',
    aliases: ['tts', 'jtts'],
    async execute(message) {
        try {
            return message.reply(await startTts(message, message.member));
        } catch (err) {
            console.error('jointts command failed:', err);
            return message.reply("I couldn't join for TTS. <:smirk2:1498272372539785286>\n-# Check console logs.");
        }
    }
};
