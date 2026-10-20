const play = require('./play');

module.exports = {
    name: 'sp',
    aliases: ['spotify'],
    execute(message, args) {
        return play.execute(message, args, 'spotify');
    }
};
