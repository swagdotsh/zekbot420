const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { fail } = require('../../ui');

const PICK_MS = 60 * 1000;
const MOVES = {
    rock: { emoji: '🪨', beats: 'scissors' },
    paper: { emoji: '📄', beats: 'rock' },
    scissors: { emoji: '✂️', beats: 'paper' },
};
const label = (move) => `${MOVES[move].emoji} ${move[0].toUpperCase()}${move.slice(1)}`;

function moveButtons(gameId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        Object.keys(MOVES).map((move) =>
            new ButtonBuilder()
                .setCustomId(`rps:${gameId}:${move}`)
                .setLabel(move[0].toUpperCase() + move.slice(1))
                .setEmoji(MOVES[move].emoji)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)),
    );
}

const rematchRow = (gameId) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rps:${gameId}:rematch`).setLabel('Rematch').setEmoji('🔁').setStyle(ButtonStyle.Primary),
);

const outcome = (a, b) => (a === b ? 0 : MOVES[a].beats === b ? 1 : -1);

function resultText(players, picks, score) {
    const [a, b] = players;
    const result = outcome(picks[a.id], picks[b.id]);
    const verdict = result === 0 ? '**It\'s a draw!**' : `**${result === 1 ? a.name : b.name} wins!**`;
    return `${a.name}: ${label(picks[a.id])}\n${b.name}: ${label(picks[b.id])}\n\n${verdict}\n-# Score: ${a.name} ${score[a.id]} - ${score[b.id]} ${b.name}`;
}

async function playRound(interaction, message, game) {
    const picks = {};
    const humans = game.players.filter((p) => !p.bot);

    await interaction.editReply({
        content: `🪨📄✂️ **Rock paper scissors** (round ${game.round})\n${humans.map((p) => `<@${p.id}>`).join(' and ')}, pick your move!`,
        components: [moveButtons(game.id)],
        allowedMentions: { users: humans.map((p) => p.id) },
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PICK_MS,
        filter: (i) => i.customId.startsWith(`rps:${game.id}:`) && !i.customId.endsWith(':rematch'),
    });

    collector.on('collect', async (i) => {
        const player = humans.find((p) => p.id === i.user.id);
        if (!player) return i.reply({ content: fail('This isn\'t your game. Start your own with `/game rps`.'), flags: MessageFlags.Ephemeral });
        if (picks[player.id]) return i.reply({ content: `You already picked ${label(picks[player.id])}.`, flags: MessageFlags.Ephemeral });

        picks[player.id] = i.customId.split(':')[2];
        if (Object.keys(picks).length < humans.length) {
            await i.reply({ content: `You picked ${label(picks[player.id])}. Waiting for the other player...`, flags: MessageFlags.Ephemeral });
            await interaction.editReply({ content: `🪨📄✂️ **Rock paper scissors** (round ${game.round})\n✅ ${player.name} has picked. Waiting for the other player...`, allowedMentions: { parse: [] } }).catch(() => {});
            return;
        }
        await i.deferUpdate();
        collector.stop('done');
    });

    return new Promise((resolve) => {
        collector.on('end', async (_, reason) => {
            if (reason !== 'done') {
                const missing = humans.filter((p) => !picks[p.id]).map((p) => p.name).join(' and ');
                await interaction.editReply({ content: `⏱️ Game over: ${missing} didn't pick in time.`, components: [], allowedMentions: { parse: [] } }).catch(() => {});
                return resolve(false);
            }
            const bot = game.players.find((p) => p.bot);
            if (bot) picks[bot.id] = Object.keys(MOVES)[Math.floor(Math.random() * 3)];

            const result = outcome(picks[game.players[0].id], picks[game.players[1].id]);
            if (result === 1) game.score[game.players[0].id]++;
            if (result === -1) game.score[game.players[1].id]++;

            await interaction.editReply({
                content: `🪨📄✂️ **Rock paper scissors** (round ${game.round})\n${resultText(game.players, picks, game.score)}`,
                components: [rematchRow(game.id)],
                allowedMentions: { parse: [] },
            }).catch(() => {});
            resolve(true);
        });
    });
}

async function waitForRematch(interaction, message, game) {
    const humans = game.players.filter((p) => !p.bot).map((p) => p.id);
    const press = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: PICK_MS,
        filter: (i) => i.customId === `rps:${game.id}:rematch` && humans.includes(i.user.id),
    }).catch(() => null);
    if (!press) {
        await interaction.editReply({ components: [] }).catch(() => {});
        return false;
    }
    await press.deferUpdate();
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock paper scissors against the bot or someone else')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addUserOption((opt) => opt.setName('opponent').setDescription('Who to play against (default: me)')),

    async execute(interaction) {
        const me = interaction.client.user;
        const opponent = interaction.options.getUser('opponent');
        const player = { id: interaction.user.id, name: interaction.member?.displayName ?? interaction.user.displayName, bot: false };

        if (opponent?.id === interaction.user.id) {
            return interaction.reply({ content: fail('You can\'t play against yourself.'), flags: MessageFlags.Ephemeral });
        }
        if (opponent?.bot && opponent.id !== me.id) {
            return interaction.reply({ content: fail('Other bots don\'t know how to play. Play against me instead!'), flags: MessageFlags.Ephemeral });
        }

        const vsBot = !opponent || opponent.id === me.id;
        const rival = vsBot
            ? { id: me.id, name: me.displayName ?? me.username, bot: true }
            : { id: opponent.id, name: interaction.options.getMember('opponent')?.displayName ?? opponent.displayName, bot: false };

        const game = { id: interaction.id, players: [player, rival], score: { [player.id]: 0, [rival.id]: 0 }, round: 1 };
        const response = await interaction.reply({ content: '🪨📄✂️ Setting up...', withResponse: true });
        const message = response.resource.message;

        while (await playRound(interaction, message, game)) {
            if (!(await waitForRematch(interaction, message, game))) break;
            game.round++;
        }
    },
};
