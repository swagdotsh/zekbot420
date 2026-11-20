const { voiceChannelBlocker, releaseTrack } = require('../../musicPlayer');

function getTrackName(track) {
    if (!track) return 'track';
    if (track.title && track.uploader) return `${track.title} - ${track.uploader}`;
    return track.attachment?.name || track.title || 'track';
}

module.exports = {
    name: 'remove',
    aliases: ['rmq', 'removequeue'],
    async execute(message, args) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('There is no active queue right now.');
        const blocked = voiceChannelBlocker(message.member, session);
        if (blocked) return message.reply(blocked);

        const pos = Number(args[0]);
        if (!Number.isInteger(pos) || pos < 1) {
            return message.reply(`Usage: \`${process.env.PREFIX}remove <position>\` (position starts at 1 for next-up queue).`);
        }

        if (!session.queue || session.queue.length === 0) {
            return message.reply('There are no queued tracks to remove.');
        }

        if (pos > session.queue.length) {
            return message.reply(`Invalid position. Queue has ${session.queue.length} item(s).`);
        }

        const [removed] = session.queue.splice(pos - 1, 1);
        releaseTrack(session, removed);

        return message.reply(`Removed **${getTrackName(removed)}** from queue.`);
    }
};