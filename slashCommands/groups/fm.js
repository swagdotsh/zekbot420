const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'fm',
    description: 'last.fm: what you\'re playing, your stats and linking your account',
    contexts: [0, 1, 2],
    integrationTypes: [0, 1],
    children: [
        { name: 'np', description: 'Show your current or most recently played track', module: require('../lastfm/nowplaying') },
        { name: 'connect', description: 'Link your Discord account to last.fm', module: require('../lastfm/linklastfm') },
        { name: 'disconnect', description: 'Unlink your last.fm account', module: require('../lastfm/disconnectfm') },
        { name: 'profile', module: require('../lastfm/fmprofile') },
        { name: 'cover', module: require('../lastfm/cover') },
        { name: 'chart', module: require('../lastfm/chart') },
        { name: 'topartists', module: require('../lastfm/topartists') },
        { name: 'topalbums', module: require('../lastfm/topalbums') },
        { name: 'toptracks', module: require('../lastfm/toptracks') },
        { name: 'albumplays', module: require('../lastfm/albumplays') },
        { name: 'trackplays', module: require('../lastfm/trackplays') },
    ],
});
