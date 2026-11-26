const crypto = require('crypto');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const DISCORD_API = 'https://discord.com/api/v10';

const b64 = (value) => Buffer.from(value).toString('base64url');
const unb64 = (value) => Buffer.from(value, 'base64url').toString('utf8');

function secret() {
    const value = process.env.DASHBOARD_SECRET;
    if (!value || value.length < 32) throw new Error('DASHBOARD_SECRET must be set to at least 32 random characters.');
    return value;
}

function sign(payload) {
    const body = b64(JSON.stringify(payload));
    const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    return `${body}.${mac}`;
}

function verify(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [body, mac] = token.split('.');
    const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(mac ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(unb64(body));
        if (!payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

function redirectUri() {
    return `${process.env.DASHBOARD_API_URL.replace(/\/$/, '')}/auth/callback`;
}

function loginUrl() {
    const state = sign({ kind: 'state', nonce: crypto.randomBytes(12).toString('hex'), exp: Date.now() + STATE_TTL_MS });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri());
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');
    return url.href;
}

async function discord(pathname, accessToken) {
    const response = await fetch(DISCORD_API + pathname, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Discord ${pathname} ${response.status}`);
    return response.json();
}

async function finishLogin(code, state, botGuildIds) {
    const parsedState = verify(state);
    if (!parsedState || parsedState.kind !== 'state') throw Object.assign(new Error('That login link expired. Try again.'), { status: 400 });

    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri(),
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Object.assign(new Error('Discord didn\'t accept that login. Try again.'), { status: 400 });
    const { access_token: accessToken } = await response.json();

    const [user, guilds] = await Promise.all([discord('/users/@me', accessToken), discord('/users/@me/guilds', accessToken)]);
    const shared = guilds.filter((g) => botGuildIds.has(g.id)).map((g) => g.id);

    return sign({
        kind: 'session',
        uid: user.id,
        name: user.global_name ?? user.username,
        username: user.username,
        avatar: user.avatar,
        guilds: shared,
        exp: Date.now() + TOKEN_TTL_MS,
    });
}

function sessionFrom(req) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const session = verify(token);
    return session?.kind === 'session' ? session : null;
}

module.exports = { loginUrl, finishLogin, sessionFrom };
