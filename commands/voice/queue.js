const { EmbedBuilder } = require('discord.js');

function getTrackName(track) {
    if (!track) return 'Unknown track';
    if (track.title && track.uploader) return `${track.title} - ${track.uploader}`;
    return track.attachment?.name || track.title || 'Unknown track';
}

function getTrackExtra(track) {
    const parts = [];

    if (track?.durationRaw && track.durationRaw !== 'Unknown') {
        parts.push(`\`${track.durationRaw}\``);
    }

    if (track?.sourceType === 'soundcloud') {
        parts.push('SoundCloud');
    }

    return parts.length ? ` ${parts.join(' • ')}` : '';
}

module.exports = {
    name: 'queue',
    aliases: ['q'],
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('There is no active queue right now.');

        const current = session.current;
        const upcoming = session.queue || [];

        if (!current && upcoming.length === 0) {
            return message.reply('Queue is empty.');
        }

        const lines = upcoming.slice(0, 10).map((item, idx) => {
            const name = getTrackName(item);
            const extra = getTrackExtra(item);
            const by = item?.requestedBy || 'Unknown';
            return `**${idx + 1}.** ${name}${extra} — requested by ${by}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x3a7ebf)
            .setTitle('Queue')
            .addFields(
                {
                    name: 'Now Playing',
                    value: current
                        ? `**${getTrackName(current)}**${getTrackExtra(current)}\nRequested by: ${current.requestedBy || 'Unknown'}`
                        : 'Nothing'
                },
                {
                    name: `Up Next (${upcoming.length})`,
                    value: lines.length ? lines.join('\n') : 'No queued tracks'
                },
                {
                    name: 'Loop',
                    value: `\`${session.loopMode || 'off'}\``,
                    inline: true
                }
            )
            .setFooter({ text: upcoming.length > 10 ? `Showing first 10 of ${upcoming.length}` : `Total queued: ${upcoming.length}` })
            .setTimestamp();

        if (current?.thumbnail) {
            embed.setThumbnail(current.thumbnail);
        }

        return message.reply({ embeds: [embed] });
    }
};