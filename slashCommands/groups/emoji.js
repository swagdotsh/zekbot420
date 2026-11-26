const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'emoji',
    description: 'Add emoji to the server or get an emoji\'s image',
    contexts: [0],
    children: [
        { name: 'add', module: require('../utility/addemoji') },
        { name: 'fetch', module: require('../utility/fetchemoji') },
    ],
});
