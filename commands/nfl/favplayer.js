const espn = require('../../espn');
const { addFavPlayer, removeFavPlayer, getFavPlayers, setHomeGuild, MAX_FAV_PLAYERS } = require('../../nflHandler');

const LEAGUES = {
    nfl: { label: 'NFL', example: 'Josh Allen (BUF)', team: 'BUF', emoji: '🏈', pings: 'their touchdowns and 20+ yard plays' },
    nba: { label: 'NBA', example: 'LeBron James (LAL)', team: 'LAL', emoji: '🏀', pings: '40 and 50 point games, triple-doubles, 10+ threes, 20+ rebounds, buzzer beaters and go-ahead shots' },
};

function splitLeague(args, forcedLeague) {
    if (forcedLeague) return { league: forcedLeague, rest: args };
    if (LEAGUES[args[0]?.toLowerCase()]) return { league: args[0].toLowerCase(), rest: args.slice(1) };
    return { league: 'nfl', rest: args, defaulted: true };
}

// "Josh Allen (BUF)" or "Josh Allen BUF" -> { name: 'Josh Allen', teamQuery: 'BUF' }
function parsePlayerQuery(args) {
    const text = args.join(' ').trim();
    const paren = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (paren) return { name: paren[1], teamQuery: paren[2] };
    return { name: text, teamQuery: null };
}

async function resolvePlayer(args, league) {
    const { findTeam, searchPlayers } = espn[league];
    const info = LEAGUES[league];
    let { name, teamQuery } = parsePlayerQuery(args);
    let team = teamQuery ? await findTeam(teamQuery) : null;
    if (teamQuery && !team) return { error: `I don't know the team **${teamQuery}**. Try an abbreviation like \`${info.team}\`.` };

    // Also allow a trailing team without parentheses, "Josh Allen BUF"
    if (!team && args.length > 1) {
        const trailing = await findTeam(args[args.length - 1]);
        if (trailing) {
            team = trailing;
            name = args.slice(0, -1).join(' ');
        }
    }

    const matches = await searchPlayers(name, team);
    if (!matches.length) return { error: `Couldn't find a player called **${name}**${team ? ` on ${team.abbreviation}` : ''}.` };
    if (matches.length > 1) {
        const list = matches.slice(0, 8).map(p => `• ${p.name} (${p.teamAbbr}, ${p.position})`).join('\n');
        return { error: `More than one player matches, add their team like \`${info.example}\`:\n${list}` };
    }
    return { player: matches[0] };
}

async function listAll(userId, prefix) {
    const sections = [];
    for (const [league, info] of Object.entries(LEAGUES)) {
        const favs = await getFavPlayers(userId, league);
        if (favs.length) sections.push(`**${info.label}** (${favs.length}/${MAX_FAV_PLAYERS})\n${favs.map(f => `• ${f.athlete_name} (${f.team_abbr})`).join('\n')}`);
    }
    if (!sections.length) return `You don't have any fav players yet. Add one with \`${prefix}favplayer Josh Allen (BUF)\` or \`${prefix}favplayer nba LeBron James (LAL)\`.`;
    return `**Your fav players**\n${sections.join('\n')}\n-# Remove one with \`${prefix}favplayer [nba] remove <name>\``;
}

module.exports = {
    name: 'favplayer',
    aliases: ['favp', 'nflplayer'],
    async execute(message, args, forcedLeague) {
        const prefix = process.env.PREFIX;
        const { league, rest, defaulted } = splitLeague(args, forcedLeague);
        const info = LEAGUES[league];
        const command = forcedLeague === 'nba' ? `${prefix}nbaplayer` : `${prefix}favplayer${defaulted ? '' : ` ${league}`}`;

        if (!rest.length) {
            if (defaulted) return message.reply(await listAll(message.author.id, prefix));
            const favs = await getFavPlayers(message.author.id, league);
            if (!favs.length) return message.reply(`You don't have any ${info.label} fav players yet. Add one with \`${command} ${info.example}\`.`);
            const list = favs.map(f => `• ${f.athlete_name} (${f.team_abbr})`).join('\n');
            return message.reply(`**Your ${info.label} fav players** (${favs.length}/${MAX_FAV_PLAYERS})\n${list}\n-# Remove one with \`${command} remove <name>\``);
        }

        if (['remove', 'delete', 'rm'].includes(rest[0].toLowerCase())) {
            const name = rest.slice(1).join(' ').toLowerCase();
            if (!name) return message.reply(`Usage: \`${command} remove <name>\``);
            const favs = await getFavPlayers(message.author.id, league);
            const fav = favs.find(f => f.athlete_name.toLowerCase() === name)
                ?? favs.find(f => f.athlete_name.toLowerCase().includes(name));
            if (!fav) return message.reply(`**${rest.slice(1).join(' ')}** isn't one of your ${info.label} fav players.`);
            await removeFavPlayer(message.author.id, fav.athlete_id, league);
            return message.reply(`Removed **${fav.athlete_name}** from your fav players.`);
        }

        const { player, error } = await resolvePlayer(rest, league);
        if (error) return message.reply(error);

        const result = await addFavPlayer(message.author.id, player, league);
        if (result === 'exists') return message.reply(`**${player.name}** is already one of your fav players.`);
        if (result === 'full') return message.reply(`You can only have ${MAX_FAV_PLAYERS} ${info.label} fav players. Remove one first with \`${command} remove <name>\`.`);

        await setHomeGuild(message.author.id, message.guild?.id);
        message.reply(`Added **${player.name}** (${player.teamAbbr}, ${player.position}) to your fav players! You'll get pinged for ${info.pings}. ${info.emoji}`);
    }
};
