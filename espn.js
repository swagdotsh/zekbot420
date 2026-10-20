// All ESPN API calls live here. The API is undocumented, so if ESPN changes something, this should be the only file that breaks.

const ROSTER_TTL = 12 * 60 * 60 * 1000;

// ESPN uses one abbreviation per team, people type others
const TEAM_ALIASES = {
    nfl: { WAS: 'WSH', JAC: 'JAX', LA: 'LAR', ARZ: 'ARI', LVR: 'LV', OAK: 'LV', SD: 'LAC', STL: 'LAR', KAN: 'KC', NWE: 'NE', NOR: 'NO', GNB: 'GB', SFO: 'SF', TAM: 'TB' },
    nba: { GSW: 'GS', NYK: 'NY', SAS: 'SA', NOP: 'NO', UTA: 'UTAH', WAS: 'WSH', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' },
};

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
    return res.json();
}

function createLeague(sport, league) {
    const SITE = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}`;
    const CORE = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}`;
    const aliases = TEAM_ALIASES[league] ?? {};

    let teamsCache = null;
    let playersCache = null;
    let playersCachedAt = 0;

    // [{ id, abbreviation, displayName, logo }]
    async function getTeams() {
        if (teamsCache) return teamsCache;
        const data = await getJson(`${SITE}/teams`);
        teamsCache = data.sports[0].leagues[0].teams.map(({ team }) => ({
            id: team.id,
            abbreviation: team.abbreviation,
            displayName: team.displayName,
            logo: team.logos?.[0]?.href ?? null,
        }));
        return teamsCache;
    }

    // Accepts "BUF", "buf", "Bills", "Buffalo Bills"
    async function findTeam(query) {
        const q = query.trim().toUpperCase();
        const abbr = aliases[q] ?? q;
        const teams = await getTeams();
        return teams.find(t => t.abbreviation === abbr)
            ?? teams.find(t => t.displayName.toUpperCase() === q)
            ?? teams.find(t => t.displayName.toUpperCase().endsWith(` ${q}`))
            ?? null;
    }

    // Map of athleteId -> { id, name, position, teamId, teamAbbr, headshot }, for every rostered player
    async function getAllPlayers() {
        if (playersCache && Date.now() - playersCachedAt < ROSTER_TTL) return playersCache;

        const teams = await getTeams();
        const players = new Map();

        await Promise.all(teams.map(async (team) => {
            const data = await getJson(`${SITE}/teams/${team.id}/roster`);
            for (const a of (data.athletes ?? []).flatMap(group => group.items ?? [group])) {
                players.set(a.id, {
                    id: a.id,
                    name: a.displayName,
                    position: a.position?.abbreviation ?? null,
                    teamId: team.id,
                    teamAbbr: team.abbreviation,
                    headshot: a.headshot?.href ?? null,
                });
            }
        }));

        playersCache = players;
        playersCachedAt = Date.now();
        return players;
    }

    // Returns matching players, exact name matches first. Pass a team to narrow it down.
    async function searchPlayers(name, team = null) {
        const q = name.trim().toLowerCase();
        let players = [...(await getAllPlayers()).values()];
        if (team) players = players.filter(p => p.teamId === team.id);

        const exact = players.filter(p => p.name.toLowerCase() === q);
        if (exact.length) return exact;
        return players.filter(p => p.name.toLowerCase().includes(q));
    }

    // Games on the current scoreboard: [{ id, state: 'pre'|'in'|'post', home, away }]
    async function getScoreboard() {
        const data = await getJson(`${SITE}/scoreboard`);
        return data.events.map((e) => {
            const comp = e.competitions[0];
            const side = (homeAway) => {
                const c = comp.competitors.find(x => x.homeAway === homeAway);
                return { id: c.team.id, abbreviation: c.team.abbreviation };
            };
            return { id: e.id, state: comp.status.type.state, home: side('home'), away: side('away') };
        });
    }

    async function getSummary(eventId) {
        return getJson(`${SITE}/summary?event=${eventId}`);
    }

    // Line score, scoring plays and stat leaders for one game, used for quarter recaps and finals
    async function getGameSummary(eventId) {
        const data = await getSummary(eventId);
        const comp = data.header.competitions[0];

        const teams = comp.competitors.map(c => ({
            id: c.team.id,
            abbreviation: c.team.abbreviation,
            homeAway: c.homeAway,
            score: c.score,
            linescores: (c.linescores ?? []).map(l => l.displayValue),
        }));

        const scoringPlays = (data.scoringPlays ?? []).map(p => ({
            period: p.period?.number,
            teamAbbr: p.team?.abbreviation,
            type: p.type?.abbreviation,
            text: p.text,
        }));

        // { teamAbbr, passingYards: 'Name · 21/35, 258 YDS', rushingYards, receivingYards }
        const leaders = (data.leaders ?? []).map(t => {
            const entry = { teamAbbr: t.team.abbreviation };
            for (const cat of t.leaders ?? []) {
                const top = cat.leaders?.[0];
                if (top) entry[cat.name] = `${top.athlete.displayName} · ${top.displayValue}`;
            }
            return entry;
        });

        return { statusDetail: comp.status.type.detail, teams, scoringPlays, leaders };
    }

    // One page of a game's plays, oldest first. Each play has athlete participants, unlike the summary endpoint.
    async function getPlaysPage(eventId, page) {
        const data = await getJson(`${CORE}/events/${eventId}/competitions/${eventId}/plays?limit=25&page=${page}`);
        return { items: data.items ?? [], pageCount: data.pageCount ?? 1 };
    }

    return { findTeam, getTeams, getAllPlayers, searchPlayers, getScoreboard, getSummary, getGameSummary, getPlaysPage };
}

// ESPN gives refs like ".../athletes/3918298?lang=en", this pulls the id out
function idFromRef(ref) {
    return ref?.match(/\/(\d+)(?:\?|$)/)?.[1] ?? null;
}

const nfl = createLeague('football', 'nfl');
const nba = createLeague('basketball', 'nba');

module.exports = { ...nfl, idFromRef, nfl, nba };
