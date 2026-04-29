const { EmbedBuilder } = require('discord.js');

function formatMs(ms) {
    if (!Number.isFinite(ms) || ms < 0) return 'Unknown';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function getTrackName(track) {
    if (!track) return 'Unknown track';
    if (track.title && track.uploader) return `${track.title} - ${track.uploader}`;
    return track.attachment?.name || track.title || 'Unknown track';
}

function getTrackUrl(track) {
    return /^https?:\/\//i.test(track?.url || '') ? track.url : null;
}

function isOnlineTrack(track) {
    return track?.sourceType === 'soundcloud' || track?.sourceType === 'youtube';
}

function getSourceName(track) {
    if (track?.sourceType === 'youtube') return 'YouTube';
    if (track?.sourceType === 'soundcloud') return 'SoundCloud';
    return 'Local File';
}

module.exports = {
    name: 'whatsplaying',
    aliases: ['wp'],
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session || !session.current) {
            return message.reply('Nothing is currently playing. <:smirk2:1498272372539785286>');
        }

        const current = session.current;
        const status = session.player?.state?.status || 'unknown';
        const elapsedMs = Date.now() - (current.startedAt || Date.now());

        const totalMs = Number.isFinite(current.duration)
            ? current.duration * 1000
            : Number.isFinite(current.probe?.durationSec)
                ? current.probe.durationSec * 1000
                : null;

        const embed = new EmbedBuilder()
            .setColor(0x3a7ebf)
            .setTitle('Now Playing')
            .addFields(
                { name: isOnlineTrack(current) ? 'Track' : 'File', value: getTrackName(current), inline: false },
                { name: 'Requested By', value: current.requestedBy || 'Unknown', inline: true },
                { name: 'Status', value: `\`${status}\``, inline: true },
                { name: 'Loop', value: `\`${session.loopMode || 'off'}\``, inline: true },
                { name: 'Queue', value: `${session.queue?.length || 0} up next`, inline: true },
                { name: 'Length', value: totalMs ? `${formatMs(elapsedMs)} / ${formatMs(totalMs)}` : `${formatMs(elapsedMs)} / Unknown`, inline: true }
            )
            .setTimestamp();

        if (isOnlineTrack(current)) {
            embed.addFields(
                { name: 'Source', value: getSourceName(current), inline: true },
                { name: 'Artist / Uploader', value: current.uploader || 'Unknown', inline: true }
            );

            const trackUrl = getTrackUrl(current);
            if (trackUrl) {
                embed.addFields({ name: 'Link', value: `[Open track](${trackUrl})`, inline: true });
                embed.setURL(trackUrl);
            }

            if (current.thumbnail) {
                embed.setThumbnail(current.thumbnail);
            }
        } else {
            embed.addFields(
                { name: 'Size', value: formatBytes(current.attachment?.size), inline: true },
                { name: 'Format', value: current.probe?.formatName || current.attachment?.contentType || 'Unknown', inline: true },
                { name: 'Codec', value: current.probe?.codec || 'Unknown', inline: true },
                { name: 'Sample Rate', value: current.probe?.sampleRate ? `${current.probe.sampleRate} Hz` : 'Unknown', inline: true },
                { name: 'Channels', value: current.probe?.channels ? String(current.probe.channels) : 'Unknown', inline: true },
                { name: 'Bitrate', value: current.probe?.bitRate ? `${Math.round(current.probe.bitRate / 1000)} kbps` : 'Unknown', inline: true }
            );
        }

        return message.reply({ embeds: [embed] });
    }
};