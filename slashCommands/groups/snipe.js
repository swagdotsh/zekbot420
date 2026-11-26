const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'snipe',
    description: 'See recently deleted messages and removed reactions',
    children: [
        { name: 'message', module: require('../utility/snipe') },
        { name: 'reaction', module: require('../utility/rs') },
        { name: 'clear', module: require('../moderation/clearsnipe') },
    ],
});
