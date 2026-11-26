const { sendStreamingLink } = require('./_streamingLink');

module.exports = {
    name: 'spotify',
    aliases: ['spot'],
    cooldown: 3,
    execute: (message, args) => sendStreamingLink(message, args, 'spotify', 'spotify'),
};
