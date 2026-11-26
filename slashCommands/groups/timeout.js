const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'timeout',
    description: 'Timeout members',
    children: [
        { name: 'add', module: require('../moderation/timeout') },
        { name: 'remove', module: require('../moderation/untimeout') },
    ],
});
