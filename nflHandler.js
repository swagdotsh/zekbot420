const postgres = require('postgres');
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: 'require', onnotice: () => {} });

const MAX_FAV_PLAYERS = 10;
const MAX_FAV_TEAMS = 5;

const TABLES = {
    nfl: { players: 'nfl_fav_players', teams: 'nfl_fav_teams' },
    nba: { players: 'nba_fav_players', teams: 'nba_fav_teams' },
};

function tables(league) {
    const found = TABLES[league];
    if (!found) throw new Error(`Unknown league ${league}`);
    return { players: sql(found.players), teams: sql(found.teams) };
}

async function initNflDB() {
    // home_guild_id is the last server the user set a fav in, that's where their pings go
    await sql`
        CREATE TABLE IF NOT EXISTS nfl_users (
            user_id TEXT PRIMARY KEY,
            home_guild_id TEXT
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS nfl_fav_players (
            user_id TEXT,
            athlete_id TEXT,
            athlete_name TEXT,
            team_abbr TEXT,
            PRIMARY KEY (user_id, athlete_id)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS nfl_fav_teams (
            user_id TEXT,
            team_id TEXT,
            team_abbr TEXT,
            PRIMARY KEY (user_id, team_id)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS nba_fav_players (
            user_id TEXT,
            athlete_id TEXT,
            athlete_name TEXT,
            team_abbr TEXT,
            PRIMARY KEY (user_id, athlete_id)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS nba_fav_teams (
            user_id TEXT,
            team_id TEXT,
            team_abbr TEXT,
            PRIMARY KEY (user_id, team_id)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS nfl_guild_config (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT
        )
    `;
}

// Called whenever a user adds a fav from a server, so their pings follow them to wherever they last set things up
async function setHomeGuild(userId, guildId) {
    if (!guildId) return;
    await sql`
        INSERT INTO nfl_users (user_id, home_guild_id)
        VALUES (${userId}, ${guildId})
        ON CONFLICT (user_id) DO UPDATE SET home_guild_id = ${guildId}
    `;
}

async function getFavPlayers(userId, league = 'nfl') {
    return sql`SELECT athlete_id, athlete_name, team_abbr FROM ${tables(league).players} WHERE user_id = ${userId} ORDER BY athlete_name`;
}

// Returns 'added', 'exists' or 'full'
async function addFavPlayer(userId, player, league = 'nfl') {
    const current = await getFavPlayers(userId, league);
    if (current.some(p => p.athlete_id === player.id)) return 'exists';
    if (current.length >= MAX_FAV_PLAYERS) return 'full';
    await sql`
        INSERT INTO ${tables(league).players} (user_id, athlete_id, athlete_name, team_abbr)
        VALUES (${userId}, ${player.id}, ${player.name}, ${player.teamAbbr})
    `;
    return 'added';
}

async function removeFavPlayer(userId, athleteId, league = 'nfl') {
    const rows = await sql`DELETE FROM ${tables(league).players} WHERE user_id = ${userId} AND athlete_id = ${athleteId} RETURNING athlete_id`;
    return rows.length > 0;
}

async function getFavTeams(userId, league = 'nfl') {
    return sql`SELECT team_id, team_abbr FROM ${tables(league).teams} WHERE user_id = ${userId} ORDER BY team_abbr`;
}

// Returns 'added', 'exists' or 'full'
async function addFavTeam(userId, team, league = 'nfl') {
    const current = await getFavTeams(userId, league);
    if (current.some(t => t.team_id === team.id)) return 'exists';
    if (current.length >= MAX_FAV_TEAMS) return 'full';
    await sql`
        INSERT INTO ${tables(league).teams} (user_id, team_id, team_abbr)
        VALUES (${userId}, ${team.id}, ${team.abbreviation})
    `;
    return 'added';
}

async function removeFavTeam(userId, teamId, league = 'nfl') {
    const rows = await sql`DELETE FROM ${tables(league).teams} WHERE user_id = ${userId} AND team_id = ${teamId} RETURNING team_id`;
    return rows.length > 0;
}

async function setNotifyChannel(guildId, channelId) {
    if (!channelId) {
        await sql`DELETE FROM nfl_guild_config WHERE guild_id = ${guildId}`;
        return;
    }
    await sql`
        INSERT INTO nfl_guild_config (guild_id, channel_id)
        VALUES (${guildId}, ${channelId})
        ON CONFLICT (guild_id) DO UPDATE SET channel_id = ${channelId}
    `;
}

async function getNotifyChannel(guildId) {
    const rows = await sql`SELECT channel_id FROM nfl_guild_config WHERE guild_id = ${guildId}`;
    return rows[0]?.channel_id ?? null;
}

// Everyone following any of these athletes or teams, with where their pings should go
async function getFollowers(athleteIds, teamIds, league = 'nfl') {
    if (!athleteIds.length && !teamIds.length) return [];
    const { players, teams } = tables(league);
    return sql`
        SELECT f.user_id, f.athlete_name AS label, u.home_guild_id, g.channel_id
        FROM ${players} f
        LEFT JOIN nfl_users u ON u.user_id = f.user_id
        LEFT JOIN nfl_guild_config g ON g.guild_id = u.home_guild_id
        WHERE f.athlete_id IN ${sql(athleteIds.length ? athleteIds : ['-'])}
        UNION ALL
        SELECT t.user_id, t.team_abbr, u.home_guild_id, g.channel_id
        FROM ${teams} t
        LEFT JOIN nfl_users u ON u.user_id = t.user_id
        LEFT JOIN nfl_guild_config g ON g.guild_id = u.home_guild_id
        WHERE t.team_id IN ${sql(teamIds.length ? teamIds : ['-'])}
    `;
}

// Lets the play loop skip games nobody cares about
async function getFollowedIds(league = 'nfl') {
    const players = await sql`SELECT DISTINCT athlete_id FROM ${tables(league).players}`;
    const teams = await sql`SELECT DISTINCT team_id FROM ${tables(league).teams}`;
    return {
        athleteIds: new Set(players.map(r => r.athlete_id)),
        teamIds: new Set(teams.map(r => r.team_id)),
    };
}

module.exports = {
    MAX_FAV_PLAYERS,
    MAX_FAV_TEAMS,
    initNflDB,
    setHomeGuild,
    getFavPlayers,
    addFavPlayer,
    removeFavPlayer,
    getFavTeams,
    addFavTeam,
    removeFavTeam,
    setNotifyChannel,
    getNotifyChannel,
    getFollowers,
    getFollowedIds,
};
