const { stopSession } = require('../../musicPlayer');

module.exports = {
    name: 'stop',
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('Nothing is playing right now. <:smirk:1498272372539785286>');

        try {
            stopSession(message.client, message.guild.id);
            return message.reply('Stopped playback and cleared queue.');
        } catch (err) {
            console.error('stop command error:', err);
            return message.reply('Failed to stop playback. <:smirk:1498272372539785286>');
        }
    }
};
