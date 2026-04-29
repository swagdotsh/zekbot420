const fs = require('fs');
const path = require('path');
const { logClearMessages } = require('../../log');

module.exports = {
  name: 'clear',
  aliases: ['purge'],
  async execute(message, args) {
    if (!args[0] || isNaN(args[0])) {
      return message.reply('Please specify the number of messages to clear.');
    }

    const amount = parseInt(args[0]);

    if (amount <= 0) {
      return message.reply('You can only clear more than 0 messages.');
    }

    const messages = await message.channel.messages.fetch({ limit: amount });

    const messagesContent = messages.map(msg => `[${msg.author.tag}] (${msg.createdAt}): ${msg.content}`).join('\n');

    await message.delete();
    await message.channel.bulkDelete(messages, true);

    await logClearMessages(message.client, message, message.author, amount, messagesContent);

    message.channel.send(`Cleared ${amount} messages.`).then(function(msg) { return msg.delete({ timeout: 5000 }) });
  }
};
