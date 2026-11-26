const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'fortnite',
    description: 'Fortnite stats and the item shop',
    children: [
        { name: 'stats', module: require('../fortnite/fnstats') },
        { name: 'shop', module: require('../fortnite/itemshop') },
    ],
});
