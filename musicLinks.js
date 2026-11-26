const spotify = require('./spotify');

const TIMEOUT_MS = 10000;

function normalize(text) {
    return String(text ?? '')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s*[([].*?(feat|ft|with|remaster|version|edit|mix)[^)\]]*[)\]]/g, '')
        .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function similarity(a, b) {
    const x = normalize(a);
    const y = normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return 0.8;
    const xs = new Set(x.split(' '));
    const ys = y.split(' ');
    const shared = ys.filter((w) => xs.has(w)).length;
    return shared / Math.max(xs.size, ys.length);
}

function score({ title, artist, album }, want) {
    return similarity(title, want.track) * 2 + similarity(artist, want.artist) * 2 + (want.album ? similarity(album, want.album) * 0.5 : 0);
}

async function getJson(url, options = {}) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function findOnAppleMusic(want, country = process.env.APPLE_MUSIC_COUNTRY || 'us') {
    const params = new URLSearchParams({ term: `${want.artist} ${want.track}`, entity: 'song', limit: '15', country });
    const data = await getJson(`https://itunes.apple.com/search?${params}`);
    const results = (data.results ?? []).filter((r) => r.trackViewUrl);
    if (!results.length) return null;

    const ranked = results
        .map((r) => ({
            r,
            s: score({ title: r.trackName, artist: r.artistName, album: r.collectionName }, want) - (r.trackExplicitness === 'cleaned' ? 0.05 : 0),
        }))
        .sort((a, b) => b.s - a.s);

    const best = ranked[0];
    if (best.s < 2.4) return null;

    const url = best.r.trackViewUrl.replace(/[?&]uo=\d+/, '').replace(/&u$/, '');
    return {
        url,
        title: best.r.trackName,
        artist: best.r.artistName,
        album: best.r.collectionName,
        artwork: best.r.artworkUrl100?.replace('100x100', '600x600') ?? null,
    };
}

function spotifySearchUrl(want) {
    return `https://open.spotify.com/search/${encodeURIComponent(`${want.track} ${want.artist}`)}`;
}

async function findOnSpotify(want) {
    if (!spotify.isConfigured()) {
        return { url: spotifySearchUrl(want), title: want.track, artist: want.artist, exact: false };
    }

    const candidates = await Promise.all([
        spotify.searchTracks(`track:"${want.track}" artist:"${want.artist}"`, 10).catch(() => []),
        spotify.searchTracks(`${want.track} ${want.artist}`, 10).catch(() => []),
    ]);
    const ranked = candidates.flat()
        .map((t) => ({ t, s: score({ title: t.title, artist: t.artists.join(' '), album: t.album }, want) }))
        .sort((a, b) => b.s - a.s);

    const best = ranked[0];
    if (!best || best.s < 2.4) return { url: spotifySearchUrl(want), title: want.track, artist: want.artist, exact: false };
    return { url: best.t.spotifyUrl, title: best.t.title, artist: best.t.artists.join(', '), exact: true };
}

module.exports = { findOnAppleMusic, findOnSpotify, normalize, similarity };
