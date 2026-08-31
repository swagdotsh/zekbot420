const { logMessageDeletion } = require('./log');

module.exports = (client) => {
  client.snipes = new Map();

  client.on('messageDelete', async message => {
    if (!message.guild || message.author?.bot) return;

    const snipes = client.snipes.get(message.channel.id) || [];

    const attachments = message.attachments?.size
        ? [...message.attachments.values()].map(att => ({
          name: att.name ?? 'attachment',
          url: att.url,
          contentType: att.contentType ?? null,
        }))
        : [];

    snipes.unshift({
      content: message.content || (attachments.length ? '' : '[No content]'),
      attachments,
      user: message.author,
      timestamp: Date.now()
    });

    if (snipes.length > 20) snipes.pop();

    client.snipes.set(message.channel.id, snipes);

    await logMessageDeletion(client, message, message.author);
  });
};