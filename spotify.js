const fs = require('fs');
const path = require('path');

const API = 'https://api.spotify.com/v1';
const MAX_COLLECTION_TRACKS = 50;
const REFRESH_TOKEN_FILE = path.resolve(process.cwd(), 'data', 'spotify_refresh_token.json');

const tokens = {
    app: { value: null, expiresAt: 0 },
    user: { value: null, expiresAt: 0 },
};

function isConfigured() {
    return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function getRefreshToken() {
    try {
        return JSON.parse(fs.readFileSync(REFRESH_TOKEN_FILE, 'utf8')).refreshToken || process.env.SPOTIFY_REFRESH_TOKEN || null;
    } catch {
        return process.env.SPOTIFY_REFRESH_TOKEN || null;
    }
}

function canReadPlaylists() {
    return Boolean(getRefreshToken());
}

async function requestToken(body) {
    const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
    });

    if (!res.ok) {
        const error = new Error(`Spotify token request failed (${res.status})`);
        error.status = res.status;
        error.code = body.grant_type === 'refresh_token' ? 'SPOTIFY_LOGIN_EXPIRED' : 'SPOTIFY_BAD_KEYS';
        throw error;
    }

    return res.json();
}

async function getToken(kind) {
    const cached = tokens[kind];
    if (cached.value && Date.now() < cached.expiresAt - 60_000) return cached.value;

    let data;
    if (kind === 'user') {
        data = await requestToken({ grant_type: 'refresh_token', refresh_token: getRefreshToken() });
        if (data.refresh_token) {
            await fs.promises.mkdir(path.dirname(REFRESH_TOKEN_FILE), { recursive: true });
            await fs.promises.writeFile(REFRESH_TOKEN_FILE, JSON.stringify({ refreshToken: data.refresh_token }), 'utf8');
        }
    } else {
        data = await requestToken({ grant_type: 'client_credentials' });
    }

    cached.value = data.access_token;
    cached.expiresAt = Date.now() + data.expires_in * 1000;
    return cached.value;
}

async function api(pathOrUrl, kind = 'app') {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken(kind)}` } });

    if (!res.ok) {
        const error = new Error(`Spotify ${res.status} for ${url.split('?')[0]}`);
        error.status = res.status;
        throw error;
    }

    return res.json();
}

function parseSpotifyUrl(input) {
    const match = String(input).match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?|spotify:)(track|album|playlist)[/:]([A-Za-z0-9]{22})/);
    return match ? { type: match[1], id: match[2] } : null;
}

function isSpotifyUrl(input) {
    return /^(https?:\/\/(open\.spotify\.com|spotify\.link)\/|spotify:)/i.test(String(input));
}

async function expandShortLink(input) {
    if (!/^https?:\/\/spotify\.link\//i.test(input)) return input;
    const res = await fetch(input, { redirect: 'follow' }).catch(() => null);
    return res?.url || input;
}

function toTrack(item, album) {
    return {
        title: item.name,
        artists: item.artists.map(a => a.name),
        durationSec: Math.round(item.duration_ms / 1000),
        spotifyUrl: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
        thumbnail: (album ?? item.album)?.images?.[0]?.url ?? null,
    };
}

async function collectPages(firstPage, mapItem, kind) {
    const tracks = [];
    let page = firstPage;
    const total = firstPage.total ?? 0;

    while (page) {
        for (const item of page.items ?? []) {
            const track = mapItem(item);
            if (track) tracks.push(track);
        }
        if (tracks.length >= MAX_COLLECTION_TRACKS || !page.next) break;
        page = await api(page.next, kind);
    }

    return { tracks: tracks.slice(0, MAX_COLLECTION_TRACKS), total };
}

async function getFromUrl(input) {
    const parsed = parseSpotifyUrl(await expandShortLink(input));
    if (!parsed) return null;

    if (parsed.type === 'track') {
        const track = await api(`/tracks/${parsed.id}`);
        return { name: null, tracks: [toTrack(track)], total: 1 };
    }

    if (parsed.type === 'album') {
        const album = await api(`/albums/${parsed.id}`);
        const { tracks, total } = await collectPages(album.tracks, item => toTrack(item, album), 'app');
        return { name: album.name, tracks, total };
    }

    if (!canReadPlaylists()) {
        const error = new Error('Spotify playlists need SPOTIFY_REFRESH_TOKEN');
        error.code = 'SPOTIFY_NEEDS_LOGIN';
        throw error;
    }

    const playlist = await api(`/playlists/${parsed.id}?fields=name`, 'user');
    const firstPage = await api(`/playlists/${parsed.id}/items?limit=50`, 'user');
    const { tracks, total } = await collectPages(firstPage, (entry) => {
        const song = entry.item ?? entry.track;
        return song?.type === 'track' ? toTrack(song) : null;
    }, 'user');
    return { name: playlist.name, tracks, total };
}

async function searchTrack(query) {
    const data = await api(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
    const item = data.tracks?.items?.[0];
    return item ? toTrack(item) : null;
}

module.exports = { MAX_COLLECTION_TRACKS, isConfigured, canReadPlaylists, isSpotifyUrl, parseSpotifyUrl, getFromUrl, searchTrack };
