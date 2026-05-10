const { AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'fetchemoji',
  aliases: ['emoji', 'getemoji', 'ee'],
  async execute(message, args) {
    const input = args[0];

    if (!input) {
      return message.reply('Usage: `,fetchemoji [emoji]`');
    }

    const match = input.match(/^<a?:\w+:(\d+)>$/);

    if (!match) {
      return message.reply(
        'Please provide a custom Discord emoji, like `<:name:id>` or `<a:name:id>`.\n' +
        'Default Unicode emojis like 😭 or 🔥 will not work here, but you can get them from <https://emojipedia.org/>.'
      );
    }

    const isAnimated = input.startsWith('<a:');
    const emojiId = match[1];
    const extension = isAnimated ? 'gif' : 'png';
    const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?quality=lossless`;

    const attachment = new AttachmentBuilder(emojiUrl, {
      name: `emoji.${extension}`,
    });

    return message.reply({
      files: [attachment],
    });
  },
};