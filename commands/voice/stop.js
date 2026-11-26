const { stopSession, voiceChannelBlocker } = require('../../musicPlayer');

module.exports = {
    name: 'stop',
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('Nothing is playing right now. <:smirk2:1498272372539785286>');
        const blocked = voiceChannelBlocker(message.member, session);
        if (blocked) return message.reply(blocked);

        try {
            stopSession(message.client, message.guild.id);
            return message.reply('Stopped playback and cleared queue.');
        } catch (err) {
            console.error('stop command error:', err);
            return message.reply('Failed to stop playback. <:smirk2:1498272372539785286>');
        }
    }
};
