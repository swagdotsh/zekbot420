const { getVoiceConnection } = require('@discordjs/voice');
const { stopSession } = require('../../musicPlayer');

module.exports = {
    name: 'leave',
    aliases: ['dc', 'disconnect'],
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);

        if (!session && !getVoiceConnection(message.guild.id)) {
            return message.reply("I'm currently not in a voice channel. <:smirk:1498272372539785286>");
        }

        try {
            if (session) stopSession(message.client, message.guild.id);

            getVoiceConnection(message.guild.id)?.destroy();

            return message.reply('👋 Left the voice channel and cleared queue.');
        } catch (err) {
            console.error('leave command error:', err);
            return message.reply('Failed to leave the voice channel. <:smirk:1498272372539785286>');
        }
    }
};
