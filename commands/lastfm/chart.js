const axios = require('axios');
const { neon } = require('@neondatabase/serverless');
const sharp = require('sharp');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

const sql = neon(process.env.NEON_DATABASE_URL);
const LASTFM_URL = 'https://ws.audioscrobbler.com/2.0/';
const TILE_SIZE = 300;
const MAX_GRID_SIDE = 5;
const PLACEHOLDER_ART = '2a96cbd8b46e442fc41c2b86b821562f.png';
const PERIODS = new Map([
    ['7d', { value: '7day', label: 'weekly' }],
    ['7day', { value: '7day', label: 'weekly' }],
    ['week', { value: '7day', label: 'weekly' }],
    ['weekly', { value: '7day', label: 'weekly' }],
    ['30d', { value: '1month', label: 'past 30 days' }],
    ['1m', { value: '1month', label: 'monthly' }],
    ['month', { value: '1month', label: 'monthly' }],
    ['3m', { value: '3month', label: 'past 3 months' }],
    ['3month', { value: '3month', label: 'past 3 months' }],
    ['6m', { value: '6month', label: 'past 6 months' }],
    ['6month', { value: '6month', label: 'past 6 months' }],
    ['12m', { value: '12month', label: 'past year' }],
    ['1y', { value: '12month', label: 'past year' }],
    ['year', { value: '12month', label: 'past year' }],
    ['all-time', { value: 'overall', label: 'all-time' }],
    ['alltime', { value: 'overall', label: 'all-time' }],
    ['overall', { value: 'overall', label: 'all-time' }],
]);

function parseChartArgs(args) {
    const chartType = args[0]?.toLowerCase();
    if (!['albums', 'artists'].includes(chartType)) return null;

    const match = args[1]?.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;

    const columns = Number(match[1]);
    const rows = Number(match[2]);
    if (!Number.isInteger(columns) || !Number.isInteger(rows) ||
        columns < 1 || rows < 1 || columns > MAX_GRID_SIDE || rows > MAX_GRID_SIDE) {
        return null;
    }

    let period = PERIODS.get('week');
    let username = null;

    for (const arg of args.slice(2)) {
        const selectedPeriod = PERIODS.get(arg.toLowerCase());
        if (selectedPeriod) {
            period = selectedPeriod;
        } else if (!username) {
            username = arg;
        } else {
            return null;
        }
    }

    return { chartType, columns, rows, period, username };
}

function getCoverUrl(album) {
    const images = Array.isArray(album?.image) ? album.image : [];
    const url = [...images].reverse().find((image) => image?.['#text'])?.['#text'];

    if (!url || url.includes(PLACEHOLDER_ART)) return null;
    return url;
}

async function fetchAlbumCover(url) {
    try {
        const { data } = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10_000,
        });

        return await sharp(Buffer.from(data))
            .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover', position: 'centre' })
            .png()
            .toBuffer();
    } catch {
        return null;
    }
}

async function getArtistFallbackCoverUrl(artistName, apiKey) {
    try {
        const { data } = await axios.get(LASTFM_URL, {
            params: {
                method: 'artist.getTopAlbums',
                artist: artistName,
                api_key: apiKey,
                format: 'json',
                limit: 5,
            },
            timeout: 10_000,
        });

        const albums = data?.topalbums?.album;
        const list = Array.isArray(albums) ? albums : albums ? [albums] : [];
        return list.map(getCoverUrl).find(Boolean) ?? null;
    } catch {
        return null;
    }
}

async function buildChart(albums, columns, rows) {
    const width = columns * TILE_SIZE;
    const height = rows * TILE_SIZE;
    const composites = albums.map((album, index) => ({
        input: album.cover,
        left: (index % columns) * TILE_SIZE,
        top: Math.floor(index / columns) * TILE_SIZE,
    }));

    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 24, g: 24, b: 28, alpha: 1 },
        },
    })
        .composite(composites)
        .png()
        .toBuffer();
}

function formatChartList(entries, chartType) {
    return entries.map((entry, index) => {
        const plays = Number(entry.playcount ?? 0);
        const playText = Number.isFinite(plays)
            ? `${plays.toLocaleString()} play${plays === 1 ? '' : 's'}`
            : '— plays';

        if (chartType === 'artists') {
            return `**${index + 1}.** ${entry.name || 'Unknown artist'} • ${playText}`;
        }

        return `**${index + 1}.** ${entry.name || 'Unknown album'} — *${entry.artist?.name || 'Unknown artist'}* • ${playText}`;
    }).join('\n');
}

module.exports = {
    name: 'chart',
    aliases: ['fmchart', 'weeklychart'],

    async execute(message, args) {
        const options = parseChartArgs(args);
        if (!options) {
            return message.reply(
                'Usage: `,chart albums|artists 3x3 [period] [lastfm username]`\n' +
                'Chart sizes can be from `1x1` to `5x5`. Periods include `7d`, `30d`, `3m`, `6m`, `1y`, and `all-time`. Leave off the username to use your linked Last.fm account.'
            );
        }

        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) return message.reply('Missing `LASTFM_API_KEY` in the bot environment.');

        let username = options.username;
        if (!username) {
            const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`;
            username = rows[0]?.lastfm_username;
        }

        if (!username) {
            return message.reply('Link your Last.fm account with `,linklastfm`, or provide a username: `,chart albums 3x3 username`.');
        }

        const requestedAlbums = options.columns * options.rows;
        const apiLimit = Math.min(200, requestedAlbums * 4);
        const progressMessage = await message.reply('Cooking up your last.fm chart... <a:spinbot420:1498959085427490937>');

        try {
            const responseKey = options.chartType === 'albums' ? 'topalbums' : 'topartists';
            const itemKey = options.chartType === 'albums' ? 'album' : 'artist';
            const { data } = await axios.get(LASTFM_URL, {
                params: {
                    method: options.chartType === 'albums' ? 'user.getTopAlbums' : 'user.getTopArtists',
                    user: username,
                    api_key: apiKey,
                    format: 'json',
                    period: options.period.value,
                    limit: apiLimit,
                },
                timeout: 10_000,
            });

            if (data?.error) throw new Error(data.message || 'Last.fm request failed');

            const results = data?.[responseKey]?.[itemKey];
            const entries = Array.isArray(results) ? results : results ? [results] : [];
            const candidates = options.chartType === 'artists'
                ? entries
                : entries.filter((entry) => getCoverUrl(entry));

            const withCovers = [];
            for (const entry of candidates) {
                if (withCovers.length >= requestedAlbums) break;
                const coverUrl = getCoverUrl(entry) ??
                    (options.chartType === 'artists'
                        ? await getArtistFallbackCoverUrl(entry.name, apiKey)
                        : null);
                const cover = coverUrl ? await fetchAlbumCover(coverUrl) : null;
                if (cover) withCovers.push({ ...entry, cover });
            }

            if (!withCovers.length) {
                return progressMessage.edit(`No ${options.period.label} top ${options.chartType} with usable images were found for **${username}**.`);
            }

            const chartBuffer = await buildChart(withCovers, options.columns, options.rows);
            const filename = `${options.period.value}-${options.chartType}-${options.columns}x${options.rows}.png`;
            const attachment = new AttachmentBuilder(chartBuffer, { name: filename });
            const shownCountNote = withCovers.length < requestedAlbums
                ? `\n\n*Only ${withCovers.length} albums had usable cover art.*`
                : '';

            const embed = new EmbedBuilder()
                .setColor(0xd51007)
                .setTitle(`${username}'s ${options.period.label} top ${options.chartType} — ${options.columns}x${options.rows}`)
                .setDescription(`${formatChartList(withCovers, options.chartType)}${shownCountNote}`.slice(0, 4096))
                .setImage(`attachment://${filename}`)
                .setFooter({
                    text: options.chartType === 'artists'
                        ? `Last.fm • ${options.period.label} • tiles use each artist's top album cover`
                        : `Last.fm • ${options.period.label}`,
                });

            return progressMessage.edit({
                content: '',
                embeds: [embed],
                files: [attachment],
            });
        } catch (error) {
            console.error('Last.fm chart error:', error.response?.data || error.message);
            return progressMessage.edit('Couldn’t build that Last.fm chart right now. Double-check the username and try again.');
        }
    },
};
