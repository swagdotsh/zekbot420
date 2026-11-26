const play = require('./play');

module.exports = {
    name: 'sp',
    aliases: [],
    execute(message, args) {
        return play.execute(message, args, 'spotify');
    }
};
