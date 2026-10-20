const play = require('./play');

module.exports = {
    name: 'yt',
    aliases: ['youtube'],
    execute(message, args) {
        return play.execute(message, args, 'youtube');
    }
};
