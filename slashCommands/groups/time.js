const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'time',
    description: 'Timezones, time conversion, reminders and timers',
    children: [
        { name: 'convert', module: require('../utility/converttime'), flatten: true },
        { name: 'timezone', module: require('../utility/settimezone'), flatten: true },
        { name: 'zones', module: require('../utility/helptz') },
        { name: 'remind', module: require('../utility/remindme') },
        { name: 'timer', module: require('../utility/settimer') },
    ],
});
