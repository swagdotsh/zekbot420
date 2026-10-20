const { skipTts } = require('../../ttsHandler');

module.exports = {
    name: 'ttsskip',
    aliases: ['shutup', 'stfu'],
    execute(message) {
        if (!skipTts(message.client, message.guild.id)) {
            return message.reply("TTS isn't running right now. <:smirk2:1498272372539785286>");
        }
        return message.react('⏭️').catch(() => {});
    }
};
