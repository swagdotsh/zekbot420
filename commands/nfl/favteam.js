const espn = require('../../espn');
const { addFavTeam, removeFavTeam, getFavTeams, setHomeGuild, MAX_FAV_TEAMS } = require('../../nflHandler');

const LEAGUES = {
    nfl: { label: 'NFL', example: 'BUF', emoji: '🏈', pings: 'their touchdowns and field goals, plus quarter recaps and the final score' },
    nba: { label: 'NBA', example: 'LAL', emoji: '🏀', pings: 'clutch time, overtime, comebacks, buzzer beaters, go-ahead shots and the final score' },
};

function splitLeague(args, forcedLeague) {
    if (forcedLeague) return { league: forcedLeague, rest: args };
    if (LEAGUES[args[0]?.toLowerCase()]) return { league: args[0].toLowerCase(), rest: args.slice(1) };
    return { league: 'nfl', rest: args, defaulted: true };
}

async function listAll(userId, prefix) {
    const sections = [];
    for (const [league, info] of Object.entries(LEAGUES)) {
        const favs = await getFavTeams(userId, league);
        if (favs.length) sections.push(`**${info.label}** (${favs.length}/${MAX_FAV_TEAMS})\n${favs.map(f => `• ${f.team_abbr}`).join('\n')}`);
    }
    if (!sections.length) return `You don't have any fav teams yet. Add one with \`${prefix}favteam BUF\` or \`${prefix}favteam nba LAL\`.`;
    return `**Your fav teams**\n${sections.join('\n')}\n-# Remove one with \`${prefix}favteam [nba] remove <team>\``;
}

module.exports = {
    name: 'favteam',
    aliases: ['favt', 'nflteam'],
    async execute(message, args, forcedLeague) {
        const prefix = process.env.PREFIX;
        const { league, rest, defaulted } = splitLeague(args, forcedLeague);
        const info = LEAGUES[league];
        const { findTeam } = espn[league];
        const command = forcedLeague === 'nba' ? `${prefix}nbateam` : `${prefix}favteam${defaulted ? '' : ` ${league}`}`;

        if (!rest.length) {
            if (defaulted) return message.reply(await listAll(message.author.id, prefix));
            const favs = await getFavTeams(message.author.id, league);
            if (!favs.length) return message.reply(`You don't have any ${info.label} fav teams yet. Add one with \`${command} ${info.example}\`.`);
            const list = favs.map(f => `• ${f.team_abbr}`).join('\n');
            return message.reply(`**Your ${info.label} fav teams** (${favs.length}/${MAX_FAV_TEAMS})\n${list}\n-# Remove one with \`${command} remove <team>\``);
        }

        if (['remove', 'delete', 'rm'].includes(rest[0].toLowerCase())) {
            const team = rest[1] && await findTeam(rest.slice(1).join(' '));
            if (!team) return message.reply(`Usage: \`${command} remove <team>\``);
            const removed = await removeFavTeam(message.author.id, team.id, league);
            return message.reply(removed ? `Removed **${team.displayName}** from your fav teams.` : `**${team.displayName}** isn't one of your fav teams.`);
        }

        const team = await findTeam(rest.join(' '));
        if (!team) return message.reply(`I don't know the ${info.label} team **${rest.join(' ')}**. Try an abbreviation like \`${info.example}\`.`);

        const result = await addFavTeam(message.author.id, team, league);
        if (result === 'exists') return message.reply(`**${team.displayName}** is already one of your fav teams.`);
        if (result === 'full') return message.reply(`You can only have ${MAX_FAV_TEAMS} ${info.label} fav teams. Remove one first with \`${command} remove <team>\`.`);

        await setHomeGuild(message.author.id, message.guild?.id);
        message.reply(`Added the **${team.displayName}** to your fav teams! You'll get pinged for ${info.pings}. ${info.emoji}`);
    }
};
