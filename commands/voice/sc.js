const play = require('./play');

module.exports = {
    name: 'sc',
    aliases: ['soundcloud'],
    execute(message, args) {
        return play.execute(message, args, 'soundcloud');
    }
};
