const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipe',
  aliases: ['s'],
  async execute(message, args) {
    const snipes = message.client.snipes.get(message.channel.id);
    if (!snipes || snipes.length === 0) {
      return message.reply('No message has been deleted recently in this channel.');
    }

    const index = parseInt(args[0]) || 1;
    if (index < 1 || index > snipes.length) {
      return message.reply("Invalid snipe index. Please use a number between 1 and "+snipes.length+".");
    }

    const snipe = snipes[index - 1];
    const timeAgo = formatTimeAgo(Date.now() - snipe.timestamp);
    const attachments = snipe.attachments ?? [];

    const description = snipe.content?.length
        ? snipe.content
        : (attachments.length ? '*No text content (attachment only)*' : '[No content]');

    const embed = new EmbedBuilder()
        .setAuthor({ name: snipe.user.username, iconURL: snipe.user.displayAvatarURL({ dynamic: true }) })
        .setDescription(description)
        .setColor('#a903fc')
        .setFooter({ text: `${index}/${snipes.length} • Deleted ${timeAgo}` });

    if (attachments.length) {
      const links = attachments
          .map(att => `[${att.name}](${att.url})`)
          .join('\n');
      embed.addFields({ name: 'Attachments', value: links.slice(0, 1024) });

      const image = attachments.find(att =>
          att.contentType?.startsWith('image/') ?? /\.(png|jpe?g|gif|webp)$/i.test(att.name ?? '')
      );
      if (image) embed.setImage(image.url);
    }

    message.reply({ embeds: [embed] });
  }
};

function formatTimeAgo(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day(s) ago`;
  if (hours > 0) return ""+hours+" hour(s) ago";
  if (minutes > 0) return `${minutes} minute(s) ago`;
  return `${seconds} second(s) ago`;
}