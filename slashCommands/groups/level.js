const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'level',
    description: 'Levels: your rank, the leaderboard and leveling settings',
    children: [
        { name: 'rank', module: require('../leveling/rank') },
        { name: 'leaderboard', module: require('../leveling/leaderboard') },
        { name: 'channel', module: require('../leveling/lvlchannel') },
        { name: 'role', description: 'Give roles at certain levels', module: require('../leveling/lvlrole') },
    ],
});
