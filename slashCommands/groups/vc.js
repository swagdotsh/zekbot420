const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'vc',
    description: 'Manage your VoiceMaster voice channel',
    children: [
        { name: 'lock', module: require('../voicemaster/lvc') },
        { name: 'limit', module: require('../voicemaster/sl') },
        { name: 'rename', module: require('../voicemaster/rmvc') },
        { name: 'kick', module: require('../voicemaster/kvc') },
        { name: 'delete', module: require('../voicemaster/dvc') },
        { name: 'ban', module: require('../moderation/vcban') },
    ],
});
