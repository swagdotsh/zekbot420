const { voiceChannelBlocker, releaseTrack } = require('../../musicPlayer');

module.exports = {
    name: 'clearqueue',
    aliases: ['cq', 'clearq'],
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('There is no active queue right now.');
        const blocked = voiceChannelBlocker(message.member, session);
        if (blocked) return message.reply(blocked);

        const queued = session.queue || [];
        if (queued.length === 0) {
            return message.reply('Queue is already empty.');
        }

        const count = queued.length;
        session.queue = [];
        for (const item of queued) releaseTrack(session, item);

        return message.reply(`Cleared **${count}** queued track(s). Current track keeps playing.`);
    }
};