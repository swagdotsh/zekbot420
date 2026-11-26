const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'bot',
    description: 'About zekbot420: info, latency, status and uptime',
    contexts: [0, 1],
    children: [
        { name: 'info', module: require('../information/info') },
        { name: 'ping', module: require('../utility/ping') },
        { name: 'status', module: require('../information/status') },
        { name: 'uptime', module: require('../information/uptime') },
    ],
});
