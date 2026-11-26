const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { fail } = require('../../ui');

const TURN_MS = 60 * 1000;
const ACCEPT_MS = 60 * 1000;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const MARK = { X: '❌', O: '⭕' };

function winnerOf(board) {
    for (const [a, b, c] of LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line: [a, b, c] };
    }
    return board.every(Boolean) ? { mark: 'draw', line: [] } : null;
}

function minimax(board, mark, me, depth = 0) {
    const result = winnerOf(board);
    if (result) return result.mark === 'draw' ? 0 : (result.mark === me ? 10 - depth : depth - 10);
    const scores = [];
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = mark;
        scores.push(minimax(board, mark === 'X' ? 'O' : 'X', me, depth + 1));
        board[i] = null;
    }
    return mark === me ? Math.max(...scores) : Math.min(...scores);
}

function botMove(board, mark, difficulty) {
    const empty = board.map((v, i) => (v ? null : i)).filter((i) => i !== null);
    if (difficulty === 'easy' && Math.random() < 0.45) return empty[Math.floor(Math.random() * empty.length)];

    let best = -Infinity;
    let moves = [];
    for (const i of empty) {
        board[i] = mark;
        const score = minimax(board, mark === 'X' ? 'O' : 'X', mark, 1);
        board[i] = null;
        if (score > best) { best = score; moves = [i]; } else if (score === best) moves.push(i);
    }
    return moves[Math.floor(Math.random() * moves.length)];
}

function boardRows(game, { done = false } = {}) {
    const highlight = new Set(game.result?.line ?? []);
    const rows = [];
    for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
            const i = r * 3 + c;
            const mark = game.board[i];
            const button = new ButtonBuilder()
                .setCustomId(`ttt:${game.id}:${i}`)
                .setStyle(highlight.has(i) ? ButtonStyle.Success : mark === 'X' ? ButtonStyle.Danger : mark === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(done || Boolean(mark));
            if (mark) button.setEmoji(MARK[mark]);
            else button.setLabel('​');
            row.addComponents(button);
        }
        rows.push(row);
    }
    const controls = new ActionRowBuilder();
    if (done) {
        controls.addComponents(new ButtonBuilder().setCustomId(`ttt:${game.id}:rematch`).setLabel('Rematch').setEmoji('🔁').setStyle(ButtonStyle.Primary));
    } else {
        controls.addComponents(new ButtonBuilder().setCustomId(`ttt:${game.id}:forfeit`).setLabel('Forfeit').setEmoji('🏳️').setStyle(ButtonStyle.Secondary));
    }
    rows.push(controls);
    return rows;
}

function statusText(game) {
    const [x, o] = game.players;
    const header = `${MARK.X} ${x} vs ${MARK.O} ${o}`;
    if (!game.result) return `${header}\nIt's ${game.players[game.turn]}'s turn (${MARK[game.turn === 0 ? 'X' : 'O']}).`;
    if (game.result.mark === 'draw') return `${header}\n🤝 It's a draw!`;
    if (game.result.forfeit) return `${header}\n🏳️ ${game.result.forfeit} forfeited. ${game.players[game.result.mark === 'X' ? 0 : 1]} wins!`;
    if (game.result.timeout) return `${header}\n⏰ ${game.result.timeout} took too long. ${game.players[game.result.mark === 'X' ? 0 : 1]} wins!`;
    return `${header}\n🏆 ${game.players[game.result.mark === 'X' ? 0 : 1]} wins!`;
}

async function runGame(message, game, botUser, edit) {
    const isBot = (user) => user.id === botUser.id;

    if (isBot(game.players[0])) {
        game.board[botMove(game.board, 'X', game.difficulty)] = 'X';
        game.turn = 1;
    }
    await edit({ content: statusText(game), components: boardRows(game), allowedMentions: { parse: [] } });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        idle: TURN_MS,
        filter: (i) => i.customId.startsWith(`ttt:${game.id}:`),
    });

    collector.on('collect', async (interaction) => {
        const action = interaction.customId.split(':')[2];
        const seat = game.players.findIndex((p) => p.id === interaction.user.id);
        if (seat === -1) {
            return interaction.reply({ content: fail('You\'re not in this game. Start your own with `/tictactoe`.'), flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (action === 'forfeit') {
            game.result = { mark: seat === 0 ? 'O' : 'X', line: [], forfeit: interaction.user };
            collector.stop('over');
            return interaction.update({ content: statusText(game), components: boardRows(game, { done: true }), allowedMentions: { parse: [] } });
        }

        if (seat !== game.turn) {
            return interaction.reply({ content: fail('It\'s not your turn.'), flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        const cell = Number(action);
        if (game.board[cell]) return interaction.deferUpdate().catch(() => {});
        game.board[cell] = seat === 0 ? 'X' : 'O';
        game.turn = 1 - game.turn;
        game.result = winnerOf(game.board);

        if (!game.result && isBot(game.players[game.turn])) {
            const mark = game.turn === 0 ? 'X' : 'O';
            game.board[botMove(game.board, mark, game.difficulty)] = mark;
            game.turn = 1 - game.turn;
            game.result = winnerOf(game.board);
        }

        if (game.result) collector.stop('over');
        return interaction.update({ content: statusText(game), components: boardRows(game, { done: Boolean(game.result) }), allowedMentions: { parse: [] } });
    });

    collector.on('end', async (_, reason) => {
        if (reason !== 'over') {
            const slow = game.players[game.turn];
            game.result = { mark: game.turn === 0 ? 'O' : 'X', line: [], timeout: slow };
            await edit({ content: statusText(game), components: boardRows(game, { done: true }), allowedMentions: { parse: [] } }).catch(() => {});
        }
        listenForRematch(message, game, botUser, edit);
    });
}

function listenForRematch(message, game, botUser, edit) {
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000,
        filter: (i) => i.customId === `ttt:${game.id}:rematch`,
    });
    collector.on('collect', async (interaction) => {
        if (!game.players.some((p) => p.id === interaction.user.id)) {
            return interaction.reply({ content: fail('Only the players can start a rematch.'), flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        collector.stop('rematch');
        const next = newGame([game.players[1], game.players[0]], game.difficulty, `${game.id}r`);
        await interaction.update({ content: statusText(next), components: boardRows(next), allowedMentions: { parse: [] } });
        runGame(message, next, botUser, edit).catch((error) => console.error('[tictactoe]', error));
    });
    collector.on('end', (_, reason) => {
        if (reason !== 'rematch') {
            edit({ components: boardRows(game, { done: true }).slice(0, 3) }).catch(() => {});
        }
    });
}

const editVia = (interaction) => (payload) => interaction.editReply(payload);

function newGame(players, difficulty, id) {
    return { id, players, difficulty, board: Array(9).fill(null), turn: 0, result: null };
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Play tic-tac-toe against someone or against zekbot420')
        .setContexts(0, 1, 2)
        .setIntegrationTypes(0, 1)
        .addUserOption((opt) => opt.setName('opponent').setDescription('Who to challenge (leave empty to play the bot)'))
        .addStringOption((opt) =>
            opt.setName('difficulty').setDescription('Bot difficulty (default: hard)')
                .addChoices({ name: 'Easy', value: 'easy' }, { name: 'Hard (unbeatable)', value: 'hard' })),

    async execute(interaction) {
        const botUser = interaction.client.user;
        const opponent = interaction.options.getUser('opponent') ?? botUser;
        const difficulty = interaction.options.getString('difficulty') ?? 'hard';

        if (opponent.id === interaction.user.id) {
            return interaction.reply({ content: fail('You can\'t play against yourself.'), flags: MessageFlags.Ephemeral });
        }
        if (opponent.bot && opponent.id !== botUser.id) {
            return interaction.reply({ content: fail('That bot doesn\'t know how to play. Leave the opponent empty to play me!'), flags: MessageFlags.Ephemeral });
        }

        const game = newGame([interaction.user, opponent], difficulty, interaction.id);

        if (opponent.id === botUser.id) {
            await interaction.reply({ content: statusText(game), components: boardRows(game), allowedMentions: { parse: [] } });
            return runGame(await interaction.fetchReply(), game, botUser, editVia(interaction));
        }

        const prompt = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ttt:${game.id}:accept`).setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ttt:${game.id}:decline`).setLabel('Decline').setStyle(ButtonStyle.Danger),
        );
        await interaction.reply({
            content: `🎮 ${opponent}, ${interaction.user} challenged you to tic-tac-toe!`,
            components: [prompt],
            allowedMentions: { users: [opponent.id] },
        });
        const message = await interaction.fetchReply();

        const answer = await message.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: ACCEPT_MS,
            filter: async (i) => {
                if (i.user.id === opponent.id) return true;
                await i.reply({ content: fail('This challenge isn\'t for you.'), flags: MessageFlags.Ephemeral }).catch(() => {});
                return false;
            },
        }).catch(() => null);

        if (!answer) {
            return interaction.editReply({ content: `⏰ ${opponent} didn't answer the tic-tac-toe challenge.`, components: [], allowedMentions: { parse: [] } });
        }
        if (answer.customId.endsWith(':decline')) {
            return answer.update({ content: `${opponent} declined the tic-tac-toe challenge.`, components: [], allowedMentions: { parse: [] } });
        }

        await answer.update({ content: statusText(game), components: boardRows(game), allowedMentions: { parse: [] } });
        return runGame(message, game, botUser, editVia(interaction));
    },

    winnerOf,
    botMove,
};
