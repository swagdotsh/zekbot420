const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { logClearMessages } = require('../../log');

module.exports = {
  name: 'clear',
  aliases: ['purge'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('You need the **Manage Messages** permission to clear messages. <:smirk2:1498272372539785286>');
    }

    if (!args[0] || isNaN(args[0])) {
      return message.reply('Please specify the number of messages to clear.');
    }

    const amount = parseInt(args[0]);

    if (amount <= 0 || amount > 100) {
      return message.reply('You can clear between 1 and 100 messages at a time.');
    }

    // delete the command first so it isn't counted in the amount
    await message.delete().catch(() => {});

    const messages = await message.channel.messages.fetch({ limit: amount });

    const messagesContent = messages.map(msg => `[${msg.author.tag}] (${msg.createdAt}): ${msg.content}`).join('\n');

    await message.channel.bulkDelete(messages, true);

    await logClearMessages(message.client, message, message.author, amount, messagesContent);

    const confirmation = await message.channel.send(`✅ Cleared ${amount} messages.`);
    setTimeout(() => confirmation.delete().catch(() => {}), 5000);
  }
};
