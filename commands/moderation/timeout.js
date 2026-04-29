const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logTimeout } = require('../../log');

module.exports = {
  name: 'timeout',
  aliases: ['mute', 'to', 'time'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('You do not have permission to timeout members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('Mention a user to timeout.');

    if (target.id === message.author.id) {
      return message.reply("You can't timeout yourself.");
    }

    const timeArg = args[1];
    const reason = args.slice(2).join(' ') || 'No reason specified';

    const time = parseDuration(timeArg);
    if (!time) return message.reply('Please provide a valid duration for the timeout (e.g., "1m", "1h", "1d").');

    try {
      await target.timeout(time, reason);

      const embed = new EmbedBuilder()
        .setColor('#ff9900') // Orange color for timeout embed
        .setTitle('Timeout')
        .setDescription("You have been timed out in **"+message.guild.name+"**.")
        .addFields(
          { name: 'Muted By', value: message.author.tag, inline: true },
          { name: 'Muted At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Duration', value: timeArg, inline: true }
        )
        .setFooter({ text: `Server ID: ${message.guild.id}` })
        .setTimestamp();

      await target.send({ embeds: [embed] });
      await logTimeout(message.client, message.guild, target, message.author, reason, timeArg);
      message.reply(`<:timeout:1370370278873497710>`);
    } catch (err) {
      console.error(err);
      message.reply('There was an error executing the timeout.');
    }
  }
};

function parseDuration(duration) {
  if (!duration) return null;
  const timeRegex = /^(\d+)(m|h|d)$/;
  const match = duration.match(timeRegex);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60 * 1000; // minutes to ms
    case 'h':
      return value * 60 * 60 * 1000; // hours to ms
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days to ms
    default:
      return null;
  }
}
