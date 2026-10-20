const { EmbedBuilder } = require('discord.js');
const { getScoreboard, getGameSummary, getPlaysPage, getAllPlayers, idFromRef } = require('../espn');
const { getFollowers, getFollowedIds } = require('../nflHandler');

const POLL_MS = 20_000;
const SCOREBOARD_MS = 60_000;
const BIG_GAIN_YARDS = 20;

// Which participant roles count as "their" play, per play type. Keeps a QB who threw a pick-six from getting a TD ping.
const TD_ROLES = {
    'Passing Touchdown': ['passer', 'receiver', 'scorer'],
    'Rushing Touchdown': ['rusher', 'scorer'],
};
const DEFAULT_TD_ROLES = ['scorer', 'returner'];
const FG_ROLES = ['kicker', 'scorer'];
const BIG_GAIN_ROLES = {
    'Pass Reception': ['passer', 'receiver'],
    'Rush': ['rusher'],
};
const PERIOD_END_TYPES = ['End Period', 'End of Half'];
// Whose headshot goes on the embed
const FEATURED_ROLES = ['scorer', 'receiver', 'rusher', 'returner', 'kicker', 'passer'];

// eventId -> { lastPage, initialized, seen: Set<playId>, pending: Set<playId> }
const games = new Map();
let scoreboard = [];
let scoreboardAt = 0;

// Returns null for boring plays, otherwise what kind of play it is and who was involved
function classifyPlay(play, players) {
    const type = play.type?.text ?? '';

    if (PERIOD_END_TYPES.includes(type)) {
        const period = play.period?.number;
        // End of Q4 only matters if it's tied and going to OT, otherwise the final score ping covers it
        if (period >= 4 && play.awayScore !== play.homeScore) return null;
        return { kind: 'period', period, athleteIds: [], teamId: null };
    }

    const participants = (play.participants ?? []).map(p => ({ athleteId: idFromRef(p.athlete?.$ref), role: p.type }));
    const isTouchdown = play.scoringType?.name === 'touchdown' || /touchdown/i.test(type);

    let kind;
    let roles;
    if (isTouchdown) {
        kind = 'td';
        roles = TD_ROLES[type] ?? DEFAULT_TD_ROLES;
    } else if (type === 'Field Goal Good') {
        // statYardage on a made FG is the kick distance
        kind = 'fg';
        roles = FG_ROLES;
    } else if (BIG_GAIN_ROLES[type] && play.statYardage >= BIG_GAIN_YARDS && !play.isPenalty) {
        // Only rushes and catches, statYardage on kickoffs/punts is return yards
        kind = 'big';
        roles = BIG_GAIN_ROLES[type];
    } else {
        return null;
    }

    const involved = participants.filter(p => p.athleteId && roles.includes(p.role));
    const athleteIds = [...new Set(involved.map(p => p.athleteId))];

    // favteam pings on TDs and FGs. The scorer's roster team is more reliable than play.team on return TDs.
    let teamId = null;
    if (kind === 'td' || kind === 'fg') {
        const scorer = participants.find(p => p.role === 'scorer');
        teamId = players.get(scorer?.athleteId)?.teamId ?? idFromRef(play.team?.$ref);
    }

    const featured = FEATURED_ROLES.map(r => involved.find(p => p.role === r)).find(Boolean);

    return { kind, type, yards: play.statYardage, athleteIds, teamId, featuredId: featured?.athleteId ?? null };
}

function quarterLabel(period) {
    return period > 4 ? (period === 5 ? 'OT' : `${period - 4}OT`) : `Q${period}`;
}

function buildPlayEmbed(play, big, game, players) {
    const featured = players.get(big.featuredId);
    const titles = {
        td: '🏈 TOUCHDOWN!',
        fg: `🎯 ${big.yards}-yard field goal`,
        big: `💨 ${big.yards}-yard ${big.type === 'Rush' ? 'run' : 'catch'}`,
    };
    const colors = { td: 0x2ecc71, fg: 0xf1c40f, big: 0x013369 };

    return new EmbedBuilder()
        .setColor(colors[big.kind])
        .setTitle(titles[big.kind])
        .setDescription(play.text ?? play.shortText ?? 'Big play!')
        .setThumbnail(featured?.headshot ?? null)
        .setFooter({ text: `${game.away.abbreviation} ${play.awayScore} – ${play.homeScore} ${game.home.abbreviation} · ${quarterLabel(play.period?.number)} ${play.clock?.displayValue ?? ''}` })
        .setTimestamp(play.wallclock ? new Date(play.wallclock) : new Date());
}

// Monospace line score, away on top like a TV bug
function lineScoreBlock(summary) {
    const ordered = ['away', 'home'].map(side => summary.teams.find(t => t.homeAway === side));
    const periods = Math.max(...ordered.map(t => t.linescores.length));
    const header = ['   ', ...Array.from({ length: periods }, (_, i) => quarterLabel(i + 1).replace(/^Q/, '')), 'T'];
    const rows = ordered.map(t => [t.abbreviation, ...Array.from({ length: periods }, (_, i) => t.linescores[i] ?? '-'), t.score]);
    const fmt = (cells) => cells.map((c, i) => i === 0 ? String(c).padEnd(3) : String(c).padStart(3)).join(' ');
    return '```\n' + [header, ...rows].map(fmt).join('\n') + '\n```';
}

function leaderFields(summary) {
    // Same away-then-home order as the line score
    const order = ['away', 'home'].map(side => summary.teams.find(t => t.homeAway === side)?.abbreviation);
    const leaders = [...summary.leaders].sort((a, b) => order.indexOf(a.teamAbbr) - order.indexOf(b.teamAbbr));
    return leaders.map(l => ({
        name: `${l.teamAbbr} leaders`,
        value: [
            l.passingYards && `**Pass** ${l.passingYards}`,
            l.rushingYards && `**Rush** ${l.rushingYards}`,
            l.receivingYards && `**Rec** ${l.receivingYards}`,
        ].filter(Boolean).join('\n') || 'No stats yet',
        inline: true,
    }));
}

// Quarter recap (period set) or final score (period null)
function buildSummaryEmbed(summary, game, period) {
    const away = summary.teams.find(t => t.homeAway === 'away');
    const home = summary.teams.find(t => t.homeAway === 'home');
    const score = `${away.abbreviation} ${away.score} – ${home.score} ${home.abbreviation}`;

    let title;
    if (period == null) title = `🏁 ${summary.statusDetail}: ${score}`;
    else if (period === 2) title = `⏸️ Halftime: ${score}`;
    else if (period >= 4) title = `😱 Headed to ${period === 4 ? 'overtime' : 'another OT'}: ${score}`;
    else title = `⏱️ End of ${quarterLabel(period)}: ${score}`;

    const embed = new EmbedBuilder()
        .setColor(period == null ? 0xe74c3c : 0x95a5a6)
        .setTitle(title)
        .setDescription(lineScoreBlock(summary))
        .setTimestamp();

    // Recaps list what happened that quarter, finals skip it since the whole game wouldn't fit
    if (period != null) {
        const scoring = summary.scoringPlays
            .filter(p => p.period === period)
            .map(p => `**${p.teamAbbr} ${p.type}** · ${p.text}`);
        embed.addFields({ name: `Scoring in ${quarterLabel(period)}`, value: (scoring.join('\n') || 'No scoring').slice(0, 1024) });
    }

    embed.addFields(leaderFields(summary));
    return embed;
}

// Sends one embed to everyone in followers, grouped into their sportsnotify channel or DMed
async function sendToFollowers(client, followers, embed, dmIntro) {
    // One ping per user, even if they follow both the player and the team
    const byUser = new Map();
    for (const f of followers) {
        const entry = byUser.get(f.user_id) ?? { ...f, labels: new Set() };
        entry.labels.add(f.label);
        byUser.set(f.user_id, entry);
    }

    const channelGroups = new Map(); // channelId -> [user entries]
    const dmUsers = [];

    for (const user of byUser.values()) {
        const guild = user.home_guild_id && user.channel_id ? client.guilds.cache.get(user.home_guild_id) : null;
        const stillMember = guild && await guild.members.fetch(user.user_id).catch(() => null);
        if (stillMember) {
            if (!channelGroups.has(user.channel_id)) channelGroups.set(user.channel_id, []);
            channelGroups.get(user.channel_id).push(user);
        } else {
            dmUsers.push(user);
        }
    }

    const reason = (user) => [...user.labels].join(', ');
    console.log(`[nfl] ${embed.data.title} -> ${byUser.size} user(s), ${channelGroups.size} channel(s), ${dmUsers.length} DM(s)`);

    for (const [channelId, users] of channelGroups) {
        const channel = client.channels.cache.get(channelId);
        const content = users.map(u => `<@${u.user_id}> · ${reason(u)}`).join('\n');
        const sent = await channel?.send({ content, embeds: [embed], allowedMentions: { users: users.map(u => u.user_id) } }).catch(() => null);
        // Channel deleted or missing perms, fall back to DMs
        if (!sent) dmUsers.push(...users);
    }

    for (const user of dmUsers) {
        // DMs closed is fine, just skip them
        await client.users.send(user.user_id, { content: dmIntro(reason(user)), embeds: [embed] }).catch(() => {});
    }
}

async function notifyPlay(client, play, big, game, players) {
    if (big.kind === 'period') return notifyGameUpdate(client, game, big.period);

    const followers = await getFollowers(big.athleteIds, big.teamId ? [big.teamId] : []);
    if (!followers.length) return;
    await sendToFollowers(client, followers, buildPlayEmbed(play, big, game, players), (who) => `Big play from **${who}**!`);
}

// Quarter recap or final score, goes to followers of either team
async function notifyGameUpdate(client, game, period = null) {
    const followers = await getFollowers([], [game.home.id, game.away.id]);
    if (!followers.length) return;

    const summary = await getGameSummary(game.id);
    const what = period == null ? 'Final score' : period === 2 ? 'Halftime' : `End of ${quarterLabel(period)}`;
    await sendToFollowers(client, followers, buildSummaryEmbed(summary, game, period), (who) => `${what} for **${who}**`);
}

async function pollGame(client, game, players) {
    let state = games.get(game.id);
    if (!state) {
        state = { lastPage: 1, initialized: false, seen: new Set(), pending: new Set() };
        games.set(game.id, state);
    }

    // Re-fetch the last page we saw too, since it fills up between polls
    const plays = [];
    let page = state.lastPage;
    while (true) {
        const { items, pageCount } = await getPlaysPage(game.id, page);
        plays.push(...items);
        if (page >= pageCount) break;
        page++;
    }
    state.lastPage = page;

    // First time seeing this game (bot just started, or the game just kicked off), don't spam everything that already happened
    if (!state.initialized) {
        for (const play of plays) state.seen.add(play.id);
        state.initialized = true;
        return;
    }

    const isFinal = game.state === 'post';
    const stillBig = new Set();

    for (const play of plays) {
        if (state.seen.has(play.id)) continue;
        const big = classifyPlay(play, players);
        if (!big) continue;
        stillBig.add(play.id);

        // Wait one poll before pinging so overturned/penalized plays get a chance to change.
        // Once the game's over there won't be another poll, so send whatever's left.
        if (!state.pending.has(play.id) && !isFinal) {
            state.pending.add(play.id);
            continue;
        }

        state.seen.add(play.id);
        state.pending.delete(play.id);
        await notifyPlay(client, play, big, game, players).catch(err => console.error('NFL notify failed:', err));
    }

    // Anything pending that's gone or no longer a big play got overturned
    for (const id of state.pending) {
        if (!stillBig.has(id)) state.pending.delete(id);
    }
}

function startNflPlayLoop(client) {
    let isRunning = false;

    const tick = async () => {
        if (isRunning) return;
        isRunning = true;

        try {
            if (Date.now() - scoreboardAt > SCOREBOARD_MS) {
                scoreboard = await getScoreboard();
                scoreboardAt = Date.now();
            }

            const followed = await getFollowedIds();
            if (!followed.athleteIds.size && !followed.teamIds.size) return;

            const players = await getAllPlayers();
            const followedTeams = new Set(followed.teamIds);
            for (const id of followed.athleteIds) {
                const teamId = players.get(id)?.teamId;
                if (teamId) followedTeams.add(teamId);
            }

            for (const game of scoreboard) {
                const relevant = followedTeams.has(game.home.id) || followedTeams.has(game.away.id);
                // A game we were watching that just ended gets one last poll to flush pending plays, then the final score.
                // Games that ended before the bot started never get a final, since games won't have them.
                const active = game.state === 'in' || (game.state === 'post' && games.has(game.id));
                if (!relevant || !active) continue;

                await pollGame(client, game, players).catch(err => console.error(`NFL poll failed for ${game.id}:`, err));
                if (game.state === 'post') {
                    games.delete(game.id);
                    await notifyGameUpdate(client, game).catch(err => console.error(`NFL final failed for ${game.id}:`, err));
                }
            }
        } catch (error) {
            console.error('NFL play loop failed:', error);
        } finally {
            isRunning = false;
        }
    };

    tick();
    setInterval(tick, POLL_MS);
}

module.exports = { startNflPlayLoop, classifyPlay, sendToFollowers };
