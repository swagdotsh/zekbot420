const { EmbedBuilder } = require('discord.js');
const { nba } = require('../espn');
const { getFollowers, getFollowedIds } = require('../nflHandler');
const { sendToFollowers } = require('./nflPlayLoop');

const POLL_MS = 20_000;
const SCOREBOARD_MS = 60_000;
const CLUTCH_SECONDS = 5 * 60;
const CLUTCH_MARGIN = 5;
const COMEBACK_DEFICIT = 15;
const GO_AHEAD_SECONDS = 10;
const BUZZER_SECONDS = 1;
const BUZZER_MARGIN = 3;

const games = new Map();
let scoreboard = [];
let scoreboardAt = 0;

function parseClock(display) {
    const text = String(display ?? '');
    if (text.includes(':')) {
        const [minutes, seconds] = text.split(':').map(Number);
        return minutes * 60 + seconds;
    }
    const seconds = parseFloat(text);
    return Number.isFinite(seconds) ? seconds : Infinity;
}

function periodLabel(period) {
    if (period <= 4) return `Q${period}`;
    return period === 5 ? 'OT' : `${period - 4}OT`;
}

function parseBox(summary) {
    const players = new Map();
    for (const team of summary.boxscore?.players ?? []) {
        for (const group of team.statistics ?? []) {
            const keys = group.keys ?? [];
            for (const entry of group.athletes ?? []) {
                if (entry.didNotPlay || !entry.stats?.length) continue;
                const stat = (key) => entry.stats[keys.indexOf(key)];
                const number = (key) => parseInt(stat(key), 10) || 0;
                players.set(entry.athlete.id, {
                    id: entry.athlete.id,
                    name: entry.athlete.displayName,
                    headshot: entry.athlete.headshot?.href ?? null,
                    teamId: team.team.id,
                    teamAbbr: team.team.abbreviation,
                    points: number('points'),
                    rebounds: number('rebounds'),
                    assists: number('assists'),
                    steals: number('steals'),
                    blocks: number('blocks'),
                    threes: parseInt(String(stat('threePointFieldGoalsMade-threePointFieldGoalsAttempted') ?? '0').split('-')[0], 10) || 0,
                });
            }
        }
    }
    return players;
}

function parseGame(summary) {
    const comp = summary.header.competitions[0];
    const side = (homeAway) => {
        const c = comp.competitors.find(x => x.homeAway === homeAway);
        return {
            id: c.team.id,
            abbreviation: c.team.abbreviation,
            score: Number(c.score ?? 0),
            linescores: (c.linescores ?? []).map(l => l.displayValue),
        };
    };
    return {
        id: comp.id,
        home: side('home'),
        away: side('away'),
        state: comp.status.type.state,
        detail: comp.status.type.detail,
        plays: summary.plays ?? [],
        box: parseBox(summary),
    };
}

function newGameState() {
    return { initialized: false, seen: new Set(), alerted: new Set(), maxDeficit: { home: 0, away: 0 } };
}

const MILESTONES = [
    { key: 'pts50', title: (p) => `💯 ${p.name} has 50 points!`, reached: (p) => p.points >= 50 },
    { key: 'pts40', title: (p) => `🔥 ${p.name} has 40 points!`, reached: (p) => p.points >= 40, supersededBy: 'pts50' },
    { key: 'triple', title: (p) => `🔺 Triple-double for ${p.name}!`, reached: (p) => [p.points, p.rebounds, p.assists, p.steals, p.blocks].filter(n => n >= 10).length >= 3 },
    { key: 'threes10', title: (p) => `🎯 ${p.name} has hit 10 threes!`, reached: (p) => p.threes >= 10 },
    { key: 'reb20', title: (p) => `🧱 ${p.name} has 20 rebounds!`, reached: (p) => p.rebounds >= 20 },
];

function detectPlayEvents(state, game) {
    const events = [];
    const emit = (key, event) => {
        if (state.alerted.has(key)) return;
        state.alerted.add(key);
        events.push({ key, ...event });
    };

    game.plays.forEach((play, index) => {
        if (state.seen.has(play.id)) return;
        state.seen.add(play.id);

        const period = play.period?.number ?? 0;
        const seconds = parseClock(play.clock?.displayValue);
        const score = { home: Number(play.homeScore ?? 0), away: Number(play.awayScore ?? 0) };
        const previous = index > 0 ? game.plays[index - 1] : null;
        const before = { home: Number(previous?.homeScore ?? 0), away: Number(previous?.awayScore ?? 0) };
        const at = { period, clock: play.clock?.displayValue ?? '', score };

        if (period > 4) emit(`ot${period}`, { kind: 'overtime', ...at });

        for (const side of ['home', 'away']) {
            const other = side === 'home' ? 'away' : 'home';
            const margin = score[side] - score[other];
            state.maxDeficit[side] = Math.max(state.maxDeficit[side], -margin);
            if (state.maxDeficit[side] >= COMEBACK_DEFICIT && margin >= 0) {
                emit(`comeback:${side}`, { kind: 'comeback', side, deficit: state.maxDeficit[side], ...at });
            }
        }

        if (play.scoringPlay) {
            const side = play.team?.id === game.home.id ? 'home' : 'away';
            const other = side === 'home' ? 'away' : 'home';
            const freeThrow = /free throw/i.test(play.type?.text ?? '');
            const buzzer = play.shootingPlay && !freeThrow && seconds <= BUZZER_SECONDS
                && period >= 4 && Math.abs(score.home - score.away) <= BUZZER_MARGIN;
            const goAhead = period >= 4 && seconds < GO_AHEAD_SECONDS
                && before[side] - before[other] <= 0 && score[side] - score[other] > 0;

            if (buzzer || goAhead) {
                emit(`shot:${play.id}`, {
                    kind: buzzer && goAhead ? 'goAheadBuzzer' : buzzer ? 'buzzer' : 'goAhead',
                    side,
                    text: play.text,
                    shooterId: play.participants?.[0]?.athlete?.id ?? null,
                    ...at,
                });
            }
        }

        if (period >= 4 && seconds < CLUTCH_SECONDS && Math.abs(score.home - score.away) <= CLUTCH_MARGIN) {
            emit('clutch', { kind: 'clutch', ...at });
        }
    });

    return events;
}

function detectMilestones(state, game, athleteIds) {
    const events = [];
    for (const id of athleteIds) {
        const player = game.box.get(id);
        if (!player) continue;
        for (const milestone of MILESTONES) {
            const key = `${milestone.key}:${id}`;
            if (state.alerted.has(key) || !milestone.reached(player)) continue;
            state.alerted.add(key);
            if (milestone.supersededBy && MILESTONES.find(m => m.key === milestone.supersededBy).reached(player)) continue;
            events.push({ key, kind: 'milestone', milestone, player });
        }
    }
    return events;
}

function scoreText(game, score = { home: game.home.score, away: game.away.score }) {
    return `${game.away.abbreviation} ${score.away} – ${score.home} ${game.home.abbreviation}`;
}

function footerText(game, event) {
    return `${scoreText(game, event.score)} · ${periodLabel(event.period)} ${event.clock}`.trim();
}

function statLine(player) {
    return `${player.points} PTS · ${player.rebounds} REB · ${player.assists} AST · ${player.threes} 3PM`
        + (player.steals ? ` · ${player.steals} STL` : '')
        + (player.blocks ? ` · ${player.blocks} BLK` : '');
}

function buildEventEmbed(game, event) {
    const team = (side) => game[side].abbreviation;
    const embed = new EmbedBuilder().setTimestamp();

    if (event.kind === 'milestone') {
        return embed
            .setColor(0xf58426)
            .setTitle(event.milestone.title(event.player))
            .setDescription(statLine(event.player))
            .setThumbnail(event.player.headshot)
            .setFooter({ text: `${scoreText(game)} · ${game.detail}` });
    }

    const tied = event.score.home === event.score.away;
    const titles = {
        clutch: () => '🔥 Clutch time!',
        overtime: () => `⏱️ ${event.period === 5 ? 'Overtime' : periodLabel(event.period)}!`,
        comeback: () => `📈 ${team(event.side)} erased a ${event.deficit}-point deficit!`,
        buzzer: () => '🚨 Buzzer beater!',
        goAhead: () => `🎯 ${team(event.side)} take the lead!`,
        goAheadBuzzer: () => '🚨 Go-ahead buzzer beater!',
    };
    const descriptions = {
        clutch: () => `Within ${CLUTCH_MARGIN} with under 5 minutes left. Turn it on!`,
        overtime: () => `Tied at ${event.score.home}, we're going to ${event.period === 5 ? 'overtime' : `a ${periodLabel(event.period)}`}.`,
        comeback: () => `They were down ${event.deficit} and ${tied ? "it's tied now" : 'now they lead'}.`,
    };

    return embed
        .setColor(event.kind === 'clutch' || event.kind === 'overtime' ? 0xc9082a : 0x1d428a)
        .setTitle(titles[event.kind]())
        .setDescription(event.text ?? descriptions[event.kind]())
        .setFooter({ text: footerText(game, event) });
}

function lineScoreBlock(game) {
    const periods = Math.max(game.away.linescores.length, game.home.linescores.length);
    const header = ['   ', ...Array.from({ length: periods }, (_, i) => periodLabel(i + 1).replace(/^Q/, '')), 'T'];
    const rows = ['away', 'home'].map(side => [
        game[side].abbreviation,
        ...Array.from({ length: periods }, (_, i) => game[side].linescores[i] ?? '-'),
        game[side].score,
    ]);
    const fmt = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(4) : String(c).padStart(4))).join('');
    return '```\n' + [header, ...rows].map(fmt).join('\n') + '\n```';
}

function buildFinalEmbed(game) {
    const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`🏁 ${game.detail}: ${scoreText(game)}`)
        .setDescription(lineScoreBlock(game))
        .setTimestamp();

    for (const side of ['away', 'home']) {
        const top = [...game.box.values()]
            .filter(p => p.teamId === game[side].id)
            .sort((a, b) => b.points - a.points)[0];
        if (top) embed.addFields({ name: `${game[side].abbreviation} leader`, value: `**${top.name}**\n${statLine(top)}`, inline: true });
    }
    return embed;
}

function recipientsFor(game, event) {
    if (event.kind === 'milestone') return { athleteIds: [event.player.id], teamIds: [] };
    if (event.kind === 'comeback') return { athleteIds: [], teamIds: [game[event.side].id] };
    return {
        athleteIds: event.shooterId ? [event.shooterId] : [],
        teamIds: [game.home.id, game.away.id],
    };
}

async function notify(client, game, event) {
    const { athleteIds, teamIds } = recipientsFor(game, event);
    const followers = await getFollowers(athleteIds, teamIds, 'nba');
    if (!followers.length) return;
    await sendToFollowers(client, followers, buildEventEmbed(game, event), (who) => `🏀 Heads up for **${who}**!`);
}

async function notifyFinal(client, game) {
    const followers = await getFollowers([], [game.home.id, game.away.id], 'nba');
    if (!followers.length) return;
    await sendToFollowers(client, followers, buildFinalEmbed(game), (who) => `Final score for **${who}**`);
}

async function pollGame(client, eventId, athleteIds) {
    const game = parseGame(await nba.getSummary(eventId));

    let state = games.get(eventId);
    if (!state) {
        state = newGameState();
        games.set(eventId, state);
    }

    const events = [...detectPlayEvents(state, game), ...detectMilestones(state, game, athleteIds)];

    if (!state.initialized) {
        state.initialized = true;
        return game;
    }

    for (const event of events) {
        await notify(client, game, event).catch(err => console.error(`NBA notify failed (${event.key}):`, err));
    }
    return game;
}

function startNbaGameLoop(client) {
    let isRunning = false;

    const tick = async () => {
        if (isRunning) return;
        isRunning = true;

        try {
            if (Date.now() - scoreboardAt > SCOREBOARD_MS) {
                scoreboard = await nba.getScoreboard();
                scoreboardAt = Date.now();
            }

            const followed = await getFollowedIds('nba');
            if (!followed.athleteIds.size && !followed.teamIds.size) return;

            const players = await nba.getAllPlayers();
            const followedTeams = new Set(followed.teamIds);
            for (const id of followed.athleteIds) {
                const teamId = players.get(id)?.teamId;
                if (teamId) followedTeams.add(teamId);
            }

            for (const game of scoreboard) {
                const relevant = followedTeams.has(game.home.id) || followedTeams.has(game.away.id);
                const active = game.state === 'in' || (game.state === 'post' && games.has(game.id));
                if (!relevant || !active) continue;

                const latest = await pollGame(client, game.id, [...followed.athleteIds]).catch(err => {
                    console.error(`NBA poll failed for ${game.id}:`, err);
                    return null;
                });

                if (game.state === 'post' && latest?.state === 'post') {
                    games.delete(game.id);
                    await notifyFinal(client, latest).catch(err => console.error(`NBA final failed for ${game.id}:`, err));
                }
            }
        } catch (error) {
            console.error('NBA game loop failed:', error);
        } finally {
            isRunning = false;
        }
    };

    tick();
    setInterval(tick, POLL_MS);
}

module.exports = { startNbaGameLoop, parseGame, parseClock, newGameState, detectPlayEvents, detectMilestones, buildEventEmbed, buildFinalEmbed };
