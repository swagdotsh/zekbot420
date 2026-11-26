const { PermissionFlagsBits } = require('discord.js');
const { logSnipeClear } = require('../../log');

module.exports = {
  name: 'clearsnipe',
  aliases: ['cs'],
  async execute(message) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('You need the **Manage Messages** permission to clear snipes. <:smirk2:1498272372539785286>');
    }

    const channel = message.channel;
    const snipeData = message.client.snipes.get(channel.id);

    if (!snipeData) {
      return message.reply('No snipe data to clear in this channel.');
    }

    message.client.snipes.delete(channel.id);

    await logSnipeClear(message.client, message, message.author);

    return message.reply('✅');
  }
};
