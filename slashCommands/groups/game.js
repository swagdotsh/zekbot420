const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'game',
    description: 'Play games: rock paper scissors, tic-tac-toe, Akinator and flags',
    children: [
        { name: 'rps', module: require('../fun/rps') },
        { name: 'tictactoe', module: require('../fun/tictactoe') },
        { name: 'akinator', module: require('../fun/akinator') },
        { name: 'flags', module: require('../fun/flags') },
    ],
});
