const { sendStreamingLink } = require('./_streamingLink');

module.exports = {
    name: 'am',
    aliases: ['applemusic'],
    cooldown: 3,
    execute: (message, args) => sendStreamingLink(message, args, 'apple', 'am'),
};
