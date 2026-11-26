const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const API = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
const REGION = process.env.TMDB_REGION || 'US';
const TIMEOUT_MS = 8000;
const COLOR = 0x01b4e4;

const token = () => process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMBD_READ_ACCESS_TOKEN || null;
const apiKey = () => process.env.TMDB_API_KEY || process.env.TMBD_API_KEY || null;
const isConfigured = () => Boolean(token() || apiKey());

class TmdbError extends Error {}

async function request(pathname, params = {}, { timeoutMs = TIMEOUT_MS } = {}) {
    if (!isConfigured()) throw new TmdbError('TMDB isn\'t set up. Add TMDB_READ_ACCESS_TOKEN to .env.');
    const url = new URL(API + pathname);
    for (const [key, value] of Object.entries({ language: 'en-US', ...params })) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    else url.searchParams.set('api_key', apiKey());

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 401) throw new TmdbError('The TMDB key in .env was rejected.');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`TMDB ${response.status}`);
    return response.json();
}

const yearOf = (date) => (date ? date.slice(0, 4) : null);
const titleOf = (type, item) => (type === 'movie' ? item.title : item.name);
const dateOf = (type, item) => (type === 'movie' ? item.release_date : item.first_air_date);

async function search(type, query, options) {
    const data = await request(`/search/${type}`, { query, include_adult: false, page: 1 }, options);
    return data?.results ?? [];
}

async function suggestions(type, query) {
    if (!query.trim()) {
        const data = await request(`/trending/${type}/week`, {}, { timeoutMs: 2000 });
        return (data?.results ?? []).slice(0, 10).map((item) => choice(type, item));
    }
    const results = await search(type, query, { timeoutMs: 2000 });
    return results.slice(0, 15).map((item) => choice(type, item));
}

function choice(type, item) {
    const year = yearOf(dateOf(type, item));
    const name = `${titleOf(type, item)}${year ? ` (${year})` : ''}`;
    return { name: name.slice(0, 100), value: `id:${item.id}` };
}

async function resolve(type, input) {
    const text = String(input ?? '').trim();
    const id = text.match(/^id:(\d+)$/)?.[1]
        ?? text.match(new RegExp(`themoviedb\\.org/${type}/(\\d+)`))?.[1];
    if (id) return { id: Number(id), others: [] };

    const yearMatch = text.match(/^(.*?)\s*\((\d{4})\)$/);
    const query = yearMatch ? yearMatch[1] : text;
    let results = await search(type, query);
    if (yearMatch) {
        const sameYear = results.filter((item) => yearOf(dateOf(type, item)) === yearMatch[2]);
        if (sameYear.length) results = sameYear;
    }
    if (!results.length) return null;
    return { id: results[0].id, others: results.slice(1, 4) };
}

async function details(type, id) {
    const extra = type === 'movie' ? 'credits,videos,release_dates,watch/providers' : 'aggregate_credits,videos,content_ratings,watch/providers,external_ids';
    return request(`/${type}/${id}`, { append_to_response: extra });
}

function ageRating(type, item) {
    if (type === 'movie') {
        const region = item.release_dates?.results?.find((r) => r.iso_3166_1 === REGION);
        return region?.release_dates?.find((d) => d.certification)?.certification || null;
    }
    return item.content_ratings?.results?.find((r) => r.iso_3166_1 === REGION)?.rating || null;
}

function runtimeText(minutes) {
    if (!minutes) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
}

const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);
const formatDate = (date) => {
    const time = date ? Date.parse(date) : NaN;
    return Number.isFinite(time) ? `<t:${Math.floor(time / 1000)}:D>` : null;
};

function trailerUrl(item) {
    const videos = item.videos?.results ?? [];
    const pick = videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
        ?? videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
        ?? videos.find((v) => v.site === 'YouTube' && v.type === 'Teaser');
    return pick ? `https://www.youtube.com/watch?v=${pick.key}` : null;
}

function buildPayload(type, item, others = []) {
    const title = titleOf(type, item);
    const year = yearOf(dateOf(type, item));
    const url = `https://www.themoviedb.org/${type}/${item.id}`;
    const rating = ageRating(type, item);

    const facts = [
        rating && `**${rating}**`,
        type === 'movie' ? runtimeText(item.runtime) : (item.episode_run_time?.[0] ? `${runtimeText(item.episode_run_time[0])} episodes` : null),
        item.genres?.map((g) => g.name).slice(0, 3).join(', '),
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(clip(`${title}${year ? ` (${year})` : ''}`, 256))
        .setURL(url)
        .setDescription([
            item.tagline && `*${item.tagline}*`,
            facts,
            clip(item.overview, 1500) || '*No overview yet.*',
        ].filter(Boolean).join('\n\n'));

    if (item.poster_path) embed.setThumbnail(`${IMAGE}/w342${item.poster_path}`);
    if (item.backdrop_path) embed.setImage(`${IMAGE}/w780${item.backdrop_path}`);

    const fields = [];
    if (item.vote_count) fields.push({ name: 'Rating', value: `⭐ ${item.vote_average.toFixed(1)}/10\n-# ${item.vote_count.toLocaleString('en-US')} votes`, inline: true });

    if (type === 'movie') {
        const released = formatDate(item.release_date);
        if (released) fields.push({ name: item.status === 'Released' ? 'Released' : 'Release date', value: released, inline: true });
        const directors = item.credits?.crew?.filter((c) => c.job === 'Director').map((c) => c.name) ?? [];
        if (directors.length) fields.push({ name: directors.length > 1 ? 'Directors' : 'Director', value: directors.slice(0, 3).join(', '), inline: true });
        if (item.budget) fields.push({ name: 'Budget', value: `$${item.budget.toLocaleString('en-US')}`, inline: true });
        if (item.revenue) fields.push({ name: 'Box office', value: `$${item.revenue.toLocaleString('en-US')}`, inline: true });
    } else {
        const aired = [formatDate(item.first_air_date), item.in_production ? 'now' : formatDate(item.last_air_date)].filter(Boolean).join(' – ');
        if (aired) fields.push({ name: 'Aired', value: aired, inline: true });
        fields.push({
            name: 'Seasons',
            value: `${item.number_of_seasons ?? '?'} season${item.number_of_seasons === 1 ? '' : 's'}, ${item.number_of_episodes ?? '?'} episodes`,
            inline: true,
        });
        if (item.status) fields.push({ name: 'Status', value: item.status, inline: true });
        const creators = item.created_by?.map((c) => c.name) ?? [];
        if (creators.length) fields.push({ name: 'Created by', value: creators.slice(0, 3).join(', '), inline: true });
        const networks = item.networks?.map((n) => n.name) ?? [];
        if (networks.length) fields.push({ name: 'Network', value: networks.slice(0, 3).join(', '), inline: true });
        if (item.next_episode_to_air?.air_date) {
            const next = item.next_episode_to_air;
            fields.push({ name: 'Next episode', value: `S${next.season_number}E${next.episode_number} ${formatDate(next.air_date)}`, inline: true });
        }
    }

    const cast = (type === 'tv' ? item.aggregate_credits?.cast : item.credits?.cast) ?? item.credits?.cast ?? [];
    if (cast.length) {
        const names = cast.slice(0, 6).map((c) => {
            const role = c.character ?? c.roles?.[0]?.character;
            return role ? `${c.name} *(${clip(role, 40)})*` : c.name;
        });
        fields.push({ name: 'Cast', value: clip(names.join('\n'), 1024) });
    }

    const providers = item['watch/providers']?.results?.[REGION];
    const streaming = providers?.flatrate?.map((p) => p.provider_name) ?? [];
    const buyRent = [...new Set([...(providers?.rent ?? []), ...(providers?.buy ?? [])].map((p) => p.provider_name))];
    if (streaming.length || buyRent.length) {
        const lines = [];
        if (streaming.length) lines.push(`**Stream:** ${streaming.slice(0, 6).join(', ')}`);
        if (buyRent.length) lines.push(`**Rent/buy:** ${buyRent.slice(0, 5).join(', ')}`);
        fields.push({ name: `Where to watch (${REGION})`, value: clip(lines.join('\n'), 1024) });
    }

    if (others.length) {
        fields.push({
            name: 'Did you mean',
            value: others.map((o) => `[${titleOf(type, o)}${yearOf(dateOf(type, o)) ? ` (${yearOf(dateOf(type, o))})` : ''}](https://www.themoviedb.org/${type}/${o.id})`).join(' · '),
        });
    }

    embed.addFields(fields.slice(0, 25))
        .setFooter({ text: 'Data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.' });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('TMDB').setURL(url),
    );
    const trailer = trailerUrl(item);
    if (trailer) buttons.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Trailer').setURL(trailer));
    if (item.imdb_id || item.external_ids?.imdb_id) {
        buttons.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('IMDb').setURL(`https://www.imdb.com/title/${item.imdb_id ?? item.external_ids.imdb_id}/`));
    }
    if (item.homepage && /^https?:\/\//.test(item.homepage)) {
        buttons.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Website').setURL(item.homepage));
    }

    return { embeds: [embed], components: [buttons] };
}

async function lookup(type, input) {
    const found = await resolve(type, input);
    if (!found) return { error: `I couldn't find a ${type === 'movie' ? 'movie' : 'show'} called **${String(input).replace(/[*_`~|]/g, '')}**.` };
    const item = await details(type, found.id);
    if (!item) return { error: 'That title isn\'t on TMDB anymore.' };
    return buildPayload(type, item, found.others);
}

module.exports = { isConfigured, suggestions, lookup, TmdbError };
