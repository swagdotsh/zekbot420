const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'giveaway',
    description: 'Start, end or delete giveaways',
    children: [
        { name: 'start', module: require('../giveaways/startgiveaway') },
        { name: 'end', module: require('../giveaways/endgiveaway') },
        { name: 'delete', module: require('../giveaways/deletegiveaway') },
    ],
});
