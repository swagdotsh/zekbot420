const favteam = require('../nfl/favteam');

module.exports = {
    name: 'nbateam',
    aliases: ['nbat'],
    execute(message, args) {
        return favteam.execute(message, args, 'nba');
    }
};
