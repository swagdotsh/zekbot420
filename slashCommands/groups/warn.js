const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'warn',
    description: 'Warn members and see warnings',
    children: [
        { name: 'add', module: require('../moderation/warn') },
        { name: 'remove', module: require('../moderation/unwarn') },
        { name: 'list', module: require('../moderation/warnings') },
    ],
});
