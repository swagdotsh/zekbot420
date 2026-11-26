const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'ban',
    description: 'Ban and unban members',
    children: [
        { name: 'add', module: require('../moderation/ban') },
        { name: 'remove', module: require('../moderation/unban') },
    ],
});
