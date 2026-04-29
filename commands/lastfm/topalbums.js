const axios = require('axios');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

const PERIOD_MAP = {
    week: '7day',
    month: '1month',
    year: '12month'
};

function parseArgs(args) {
    const a0 = (args[0] || '').toLowerCase();
    const a1 = (args[1] || '').toLowerCase();

    // If first arg is a period keyword, then username is omitted.
    if (PERIOD_MAP[a0]) {
        return { usernameArg: null, periodKey: a0 };
    }

    // Otherwise, treat first arg as username (if present), second as period (optional).
    if (args[0]) {
        return { usernameArg: args[0], periodKey: PERIOD_MAP[a1] ? a1 : null };
    }

    return { usernameArg: null, periodKey: null };
}

module.exports = {
    name: 'topalbums',
    aliases: ['ta', 'topalbums', 'topa'],
    async execute(message, args) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');

        const { usernameArg, periodKey } = parseArgs(args);

        let username = usernameArg

        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`
            username = rows[0]?.lastfm_username
        }

        if (!username) {
            return message.reply(
                'Provide a Last.fm username or link yours first. e.g. `,topalbums username week` or `,ta month`'
            );
        }

        const period = PERIOD_MAP[periodKey] || PERIOD_MAP.week; // default: week
        const prettyPeriod = periodKey || 'week';

        const topUrl =
            `https://ws.audioscrobbler.com/2.0/?method=user.getTopAlbums` +
            `&user=${encodeURIComponent(username)}` +
            `&api_key=${encodeURIComponent(apiKey)}` +
            `&format=json` +
            `&period=${encodeURIComponent(period)}` +
            `&limit=10`;

        try {
            const { data } = await axios.get(topUrl);

            const albums = data?.topalbums?.album;
            const list = Array.isArray(albums) ? albums : albums ? [albums] : [];

            if (!list.length) {
                return message.reply(`No top albums found for **${username}** (${prettyPeriod}).`);
            }

            const lines = list.map((a, i) => {
                const albumName = a?.name || 'Unknown album';
                const artist = a?.artist?.name || 'Unknown artist';
                const plays = Number(a?.playcount ?? 0);
                const albumUrl = a?.url;

                const title = albumUrl ? `[${albumName}](${albumUrl})` : albumName;
                const playsText = Number.isFinite(plays)
                    ? `${plays.toLocaleString()} play${plays === 1 ? '' : 's'}`
                    : '— plays';

                return `**${i + 1}.** ${title} — *${artist}* • **${playsText}**`;
            });

            const embed = {
                color: 0xd51007,
                author: { name: '📀 Top Albums' },
                title: `${username} • ${prettyPeriod}`,
                description: lines.join('\n'),
                footer: { text: 'Last.fm' }
            };

            return message.reply({ embeds: [embed] });
        } catch (e) {
            console.log(e.response?.data || e.message);
            return message.reply('Couldn’t fetch top albums right now—try again in a moment.');
        }
    }
};