const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'fm',
    description: 'Last.fm: what you\'re playing and linking your account',
    contexts: [0, 1, 2],
    integrationTypes: [0, 1],
    children: [
        { name: 'np', description: 'Show your current or most recently played track', module: require('../lastfm/nowplaying') },
        { name: 'connect', description: 'Link your Discord account to Last.fm', module: require('../lastfm/linklastfm') },
        { name: 'disconnect', description: 'Unlink your Last.fm account', module: require('../lastfm/disconnectfm') },
    ],
});
