const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'translate',
    description: 'Translate text, properly or badly',
    children: [
        { name: 'text', module: require('../translate/translate') },
        { name: 'bad', module: require('../translate/badtranslate') },
    ],
});
