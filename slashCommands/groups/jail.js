const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'jail',
    description: 'Jail members',
    children: [
        { name: 'add', module: require('../moderation/jail/jail') },
        { name: 'remove', module: require('../moderation/jail/unjail') },
    ],
});
