const favplayer = require('../nfl/favplayer');

module.exports = {
    name: 'nbaplayer',
    aliases: ['nbap'],
    execute(message, args) {
        return favplayer.execute(message, args, 'nba');
    }
};
