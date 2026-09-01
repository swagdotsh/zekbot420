const { EmbedBuilder } = require('discord.js');

function fieldText(content) {
    if (!content?.trim()) return '*No text content*';
    return content.length > 1024 ? `${content.slice(0, 1021)}...` : content;
}

function formatTimeAgo(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

module.exports = {
    name: 'editsnipe',
    aliases: ['es'],

    async execute(message) {
        const edit = message.client.editSnipes.get(message.channel.id);
        if (!edit) {
            return message.reply('No message has been edited recently in this channel.');
        }

        const authorName = edit.user?.username ?? 'Unknown user';
        const avatarURL = edit.user?.displayAvatarURL?.({ dynamic: true });
        const embed = new EmbedBuilder()
            .setColor('#5865f2')
            .setTitle('Edit Snipe')
            .setAuthor(avatarURL ? { name: authorName, iconURL: avatarURL } : { name: authorName })
            .addFields(
                { name: 'Original message', value: fieldText(edit.oldContent) },
                { name: 'Edited message', value: fieldText(edit.newContent) }
            )
            .setFooter({ text: `Edited ${formatTimeAgo(Date.now() - edit.timestamp)}` })
            .setTimestamp(edit.timestamp);

        return message.reply({ embeds: [embed] });
    },
};
