module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    return message.reply(user.displayAvatarURL({ extension: 'png', size: 4096 }));
  }
};
