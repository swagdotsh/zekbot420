require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

const missing = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'].filter(name => !process.env[name]);
if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in .env`);
    process.exit(1);
}

const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
const redirect = new URL(REDIRECT_URI);
const state = crypto.randomBytes(16).toString('hex');

const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'playlist-read-private playlist-read-collaborative',
    state,
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
    }

    if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
        res.writeHead(400).end('Login failed or was cancelled, run the script again.');
        console.error('Login failed:', url.searchParams.get('error') || 'state mismatch');
        server.close();
        return;
    }

    const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: REDIRECT_URI }),
    });
    const data = await tokenRes.json();

    if (!tokenRes.ok || !data.refresh_token) {
        res.writeHead(500).end('Spotify did not return a refresh token, check the terminal.');
        console.error('Token exchange failed:', data);
        server.close();
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Done! You can close this tab and go back to the terminal.');
    console.log('\nAdd this line to your .env (locally and on the server), then restart the bot:\n');
    console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`);
    server.close();
});

server.listen(Number(redirect.port) || 80, redirect.hostname, () => {
    console.log('Open this link and log in with the Spotify account the bot should read playlists as:\n');
    console.log(authUrl + '\n');
});
