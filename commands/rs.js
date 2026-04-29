const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'rs',
  aliases: ['reactionsnipe'],
  execute(message) {
    const snipe = message.client.reactionSnipes.get(message.channel.id);
    if (!snipe) return message.reply('No reactions to snipe.');

    const timeAgo = Date.now() - snipe.time;
    const seconds = Math.floor(timeAgo / 1000) % 60;
    const minutes = Math.floor(timeAgo / (1000 * 60)) % 60;
    const hours = Math.floor(timeAgo / (1000 * 60 * 60));

    let formattedTime;
    if (hours > 0) formattedTime = ""+hours+"h "+minutes+"m ago";
    else if (minutes > 0) formattedTime = ""+minutes+"m "+seconds+"s ago";
    else formattedTime = `${seconds}s ago`;

    const embed = new EmbedBuilder()
      .setColor('Random')
      .setDescription("**"+snipe.user+"** reacted to:\n\""+snipe.message+"\"\nwith **"+snipe.emoji+"**")
      .setFooter({ text: `Message by ${snipe.messageAuthor} • ${formattedTime}` })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }
};
