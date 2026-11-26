const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'react',
    description: 'Add or remove the bot\'s reactions on a message',
    contexts: [0],
    children: [
        { name: 'add', module: require('../utility/react') },
        { name: 'remove', module: require('../utility/removereact') },
        { name: 'clear', module: require('../moderation/removeallreacts') },
    ],
});
