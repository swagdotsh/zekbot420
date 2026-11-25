const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'birthday',
    description: 'Set, remove or view birthdays',
    children: [
        { name: 'set', module: require('../birthdays/setbirthday') },
        { name: 'remove', module: require('../birthdays/removebirthday') },
        { name: 'list', description: 'View server birthdays or a specific user\'s birthday', module: require('../birthdays/birthdays') },
    ],
});
