const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'reactionmute',
    description: 'Stop members from adding reactions',
    children: [
        { name: 'add', module: require('../moderation/rm/reactionmute') },
        { name: 'remove', module: require('../moderation/rm/unreactionmute') },
    ],
});
