function getTrackName(track) {
    if (!track) return 'track';
    if (track.title && track.uploader) return ""+track.title+" - "+track.uploader;
    return track.attachment?.name || track.title || 'track';
}

module.exports = {
    name: 'skip',
    aliases: ['next', 'forward', 'nt', 'nexttrack'],
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session || !session.current) {
            return message.reply('Nothing is currently playing to skip.');
        }

        const currentName = getTrackName(session.current);
        const nextName = getTrackName(session.queue?.[0]);

        session.player.stop(true);

        if (session.queue?.[0]) {
            return message.reply(`⏭ Skipped **${currentName}**. Next up: **${nextName}**`);
        }

        return message.reply(`⏭ Skipped **${currentName}**. Queue is now empty.`);
    }
};