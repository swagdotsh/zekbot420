const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'user',
    description: 'See someone\'s avatar and banner',
    contexts: [0, 1],
    children: [
        { name: 'avatar', module: require('../utility/avatar') },
        { name: 'banner', module: require('../utility/banner') },
        { name: 'serveravatar', module: require('../utility/serveravatar') },
        { name: 'serverbanner', module: require('../utility/serverbanner') },
    ],
});
