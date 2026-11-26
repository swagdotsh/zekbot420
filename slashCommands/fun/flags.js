const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { createGuildStore } = require('../../guildDataStore');
const { fail } = require('../../ui');

const ROUND_MS = 15000;
const BETWEEN_ROUNDS_MS = 2500;

const CODES = ('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW GL PR HK').split(' ');

const NAME_OVERRIDES = {
    CD: 'DR Congo',
    CG: 'Republic of the Congo',
    CI: 'Ivory Coast',
    MM: 'Myanmar',
    PS: 'Palestine',
    HK: 'Hong Kong',
    VA: 'Vatican City',
};

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRIES = CODES.map((code) => ({ code, name: NAME_OVERRIDES[code] ?? displayNames.of(code) }));

const scores = createGuildStore('flagScores.json', () => ({ wins: {} }));
const activeChannels = new Set();

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function makeRound(used) {
    const pool = COUNTRIES.filter((c) => !used.has(c.code));
    const answer = pool[Math.floor(Math.random() * pool.length)];
    used.add(answer.code);
    const wrong = shuffle(COUNTRIES.filter((c) => c.code !== answer.code)).slice(0, 3);
    return { answer, options: shuffle([answer, ...wrong]) };
}

function roundEmbed(round, number, total, footer) {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🌍 Guess the flag! (${number}/${total})`)
        .setImage(`https://flagcdn.com/w320/${round.answer.code.toLowerCase()}.png`)
        .setFooter({ text: footer ?? `First right answer scores. ${ROUND_MS / 1000} seconds!` });
}

function roundButtons(round, gameId, reveal = null) {
    return [new ActionRowBuilder().addComponents(round.options.map((option) => {
        const button = new ButtonBuilder()
            .setCustomId(`flags:${gameId}:${option.code}`)
            .setLabel(option.name.slice(0, 80))
            .setStyle(ButtonStyle.Secondary);
        if (reveal) {
            button.setDisabled(true);
            if (option.code === round.answer.code) button.setStyle(ButtonStyle.Success);
            else if (reveal.wrong.has(option.code)) button.setStyle(ButtonStyle.Danger);
        }
        return button;
    }))];
}

function playRound(message, round, gameId) {
    return new Promise((resolve) => {
        const lockedOut = new Set();
        const wrongPicks = new Set();
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: ROUND_MS,
            filter: (i) => i.customId.startsWith(`flags:${gameId}:`),
        });

        collector.on('collect', async (interaction) => {
            if (lockedOut.has(interaction.user.id)) {
                return interaction.reply({ content: fail('You already guessed this round.'), flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const picked = interaction.customId.split(':')[2];
            if (picked === round.answer.code) {
                collector.stop('answered');
                await interaction.deferUpdate().catch(() => {});
                return resolve({ winner: interaction.user, wrong: wrongPicks });
            }
            lockedOut.add(interaction.user.id);
            wrongPicks.add(picked);
            return interaction.reply({ content: '❌ Nope! You\'re out for this round.', flags: MessageFlags.Ephemeral }).catch(() => {});
        });

        collector.on('end', (_, reason) => {
            if (reason !== 'answered') resolve({ winner: null, wrong: wrongPicks });
        });
    });
}

async function playGame(interaction, totalRounds) {
    const channelId = interaction.channelId;
    if (activeChannels.has(channelId)) {
        return interaction.reply({ content: fail('A flag game is already running in this channel.'), flags: MessageFlags.Ephemeral });
    }
    activeChannels.add(channelId);

    const gameId = interaction.id;
    const used = new Set();
    const points = new Map();

    try {
        let round = makeRound(used);
        await interaction.reply({ embeds: [roundEmbed(round, 1, totalRounds)], components: roundButtons(round, gameId) });
        let message = await interaction.fetchReply();

        for (let number = 1; number <= totalRounds; number++) {
            const { winner, wrong } = await playRound(message, round, gameId);
            if (winner) {
                const entry = points.get(winner.id) ?? { user: winner, points: 0 };
                entry.points += 1;
                points.set(winner.id, entry);
            }

            const result = winner
                ? `✅ ${winner.username} got it: it's ${round.answer.name}!`
                : `⏰ Time's up! It was ${round.answer.name}.`;
            await message.edit({
                embeds: [roundEmbed(round, number, totalRounds, result).setColor(winner ? 0x57f287 : 0xed4245)],
                components: roundButtons(round, gameId, { wrong }),
            }).catch(() => {});

            if (number === totalRounds) break;
            await new Promise((r) => setTimeout(r, BETWEEN_ROUNDS_MS));
            round = makeRound(used);
            message = await interaction.channel.send({ embeds: [roundEmbed(round, number + 1, totalRounds)], components: roundButtons(round, gameId) });
        }

        const ranking = [...points.values()].sort((a, b) => b.points - a.points);
        if (interaction.guild && ranking.length) {
            await scores.update(interaction.guild.id, (data) => {
                for (const { user, points: p } of ranking) data.wins[user.id] = (data.wins[user.id] ?? 0) + p;
            }).catch((error) => console.error('[flags] failed to save scores:', error));
        }

        const medals = ['🥇', '🥈', '🥉'];
        const board = ranking.length
            ? ranking.map((entry, i) => `${medals[i] ?? `${i + 1}.`} ${entry.user} with **${entry.points}**`).join('\n')
            : 'Nobody got any right. Better luck next time!';
        const embed = new EmbedBuilder().setColor(0xfee75c).setTitle('🏁 Flag game over!').setDescription(board);
        await interaction.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } finally {
        activeChannels.delete(channelId);
    }
}

async function showLeaderboard(interaction) {
    if (!interaction.guild) return interaction.reply({ content: fail('The leaderboard is per server.'), flags: MessageFlags.Ephemeral });
    const { wins } = await scores.get(interaction.guild.id);
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const description = top.length
        ? top.map(([userId, count], i) => `**${i + 1}.** <@${userId}> with ${count} correct`).join('\n')
        : 'Nobody has played yet. Start with `/flags play`!';
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🌍 Flag game leaderboard').setDescription(description);
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('flags')
        .setDescription('Guess the country from its flag')
        .setContexts(0)
        .setIntegrationTypes(0)
        .addSubcommand((sub) =>
            sub.setName('play').setDescription('Start a flag guessing game in this channel')
                .addIntegerOption((opt) => opt.setName('rounds').setDescription('How many flags (default 5)').setMinValue(1).setMaxValue(20)))
        .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Top flag guessers in this server')),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'leaderboard') return showLeaderboard(interaction);
        return playGame(interaction, interaction.options.getInteger('rounds') ?? 5);
    },

    COUNTRIES,
};
