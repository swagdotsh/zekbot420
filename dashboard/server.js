const http = require('http');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const registry = require('../settings');
const { slashCatalog, prefixCatalog } = require('../commandCatalog');
const { loginUrl, finishLogin, sessionFrom } = require('./auth');

const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT = 90;
const RATE_WINDOW_MS = 60 * 1000;
const REQUIRED_ENV = ['DASHBOARD_PORT', 'DASHBOARD_URL', 'DASHBOARD_API_URL', 'DASHBOARD_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'];

class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

const hits = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
}, RATE_WINDOW_MS).unref();

function clientIp(req) {
    if (process.env.DASHBOARD_TRUST_PROXY === '1') {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) return String(forwarded).split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
}

function rateLimited(req) {
    const key = clientIp(req);
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
        hits.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT;
}

function allowedOrigin() {
    return new URL(process.env.DASHBOARD_URL).origin;
}

function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
    });
    res.end(payload);
}

function redirect(res, location) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
}

async function readJson(req) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too big.');
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
        throw new HttpError(400, 'That isn\'t valid JSON.');
    }
}

function guildIcon(guild) {
    return guild.iconURL({ size: 128 }) ?? null;
}

async function memberFor(client, session, guildId) {
    if (!session.guilds.includes(guildId)) return null;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    return guild.members.cache.get(session.uid) ?? await guild.members.fetch(session.uid).catch(() => null);
}

async function requireManager(client, session, guildId) {
    const member = await memberFor(client, session, guildId);
    if (!member) throw new HttpError(404, 'That server isn\'t available.');
    const sections = registry.sectionIds().filter((id) => registry.canAccess(member, id));
    if (!sections.length) throw new HttpError(403, 'You can\'t change any settings in that server.');
    return { member, guild: member.guild, sections };
}

function channelList(guild) {
    const me = guild.members.me;
    return guild.channels.cache
        .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildForum, ChannelType.GuildStageVoice].includes(c.type))
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parentId,
            botCanSend: Boolean(c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])),
        }));
}

function roleList(guild) {
    const top = guild.members.me.roles.highest.position;
    return guild.roles.cache
        .filter((r) => r.id !== guild.roles.everyone.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
            id: r.id,
            name: r.name,
            color: r.hexColor,
            position: r.position,
            managed: r.managed,
            botCanAssign: !r.managed && r.position < top,
        }));
}

async function handle(client, req, res) {
    const url = new URL(req.url, 'http://dashboard.local');
    const parts = url.pathname.split('/').filter(Boolean);
    const origin = allowedOrigin();
    const cors = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        return res.end();
    }
    if (rateLimited(req)) return send(res, 429, { error: 'Slow down.' }, { ...cors, 'Retry-After': '60' });

    if (req.method === 'GET' && url.pathname === '/auth/login') return redirect(res, loginUrl());

    if (req.method === 'GET' && url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) return redirect(res, `${process.env.DASHBOARD_URL}#error=${encodeURIComponent('Login was cancelled.')}`);
        try {
            const token = await finishLogin(code, state, new Set(client.guilds.cache.keys()));
            return redirect(res, `${process.env.DASHBOARD_URL}#token=${token}`);
        } catch (error) {
            return redirect(res, `${process.env.DASHBOARD_URL}#error=${encodeURIComponent(error.status ? error.message : 'Login failed. Try again.')}`);
        }
    }

    if (parts[0] !== 'api') return send(res, 404, { error: 'Not found.' }, cors);

    if (req.method === 'GET' && url.pathname === '/api/health') {
        return send(res, 200, { ok: true, ready: client.isReady(), guilds: client.guilds.cache.size }, cors);
    }
    if (req.method === 'GET' && url.pathname === '/api/commands') {
        return send(res, 200, { slash: slashCatalog(), prefix: prefixCatalog() }, { ...cors, 'Cache-Control': 'public, max-age=300' });
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/schema') {
        return send(res, 200, registry.describe(), { ...cors, 'Cache-Control': 'public, max-age=300' });
    }

    const session = sessionFrom(req);
    if (!session) return send(res, 401, { error: 'Log in first.' }, cors);

    if (req.method === 'GET' && url.pathname === '/api/me') {
        const guilds = [];
        for (const guildId of session.guilds) {
            const member = await memberFor(client, session, guildId);
            if (!member) continue;
            const sections = registry.sectionIds().filter((id) => registry.canAccess(member, id));
            guilds.push({ id: member.guild.id, name: member.guild.name, icon: guildIcon(member.guild), canManage: sections.length > 0, sections });
        }
        return send(res, 200, {
            user: { id: session.uid, name: session.name, username: session.username, avatar: session.avatar },
            guilds: guilds.sort((a, b) => Number(b.canManage) - Number(a.canManage) || a.name.localeCompare(b.name)),
        }, cors);
    }

    if (parts[1] === 'guilds' && /^\d{17,20}$/.test(parts[2] ?? '')) {
        const guildId = parts[2];
        const { guild, member, sections } = await requireManager(client, session, guildId);

        if (req.method === 'GET' && parts.length === 3) {
            return send(res, 200, {
                id: guild.id,
                name: guild.name,
                icon: guildIcon(guild),
                memberCount: guild.memberCount,
                boostLevel: guild.premiumTier,
                channels: channelList(guild),
                roles: roleList(guild),
                sections,
            }, cors);
        }

        if (req.method === 'GET' && parts[3] === 'settings' && parts.length === 4) {
            const values = {};
            await Promise.all(sections.map(async (id) => {
                values[id] = await registry.getSectionValues(guildId, id).catch((error) => {
                    console.error(`[dashboard] couldn't load ${id} for ${guildId}:`, error.message);
                    return null;
                });
            }));
            return send(res, 200, values, cors);
        }

        if (req.method === 'PATCH' && parts[3] === 'settings' && parts.length === 5) {
            const sectionId = parts[4];
            if (!registry.sectionIds().includes(sectionId)) throw new HttpError(404, 'That settings section doesn\'t exist.');
            if (!registry.canAccess(member, sectionId)) throw new HttpError(403, 'You don\'t have permission to change that.');
            const patch = await readJson(req);
            if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Send an object of settings.');
            try {
                const saved = await registry.updateSection(guildId, sectionId, patch, { id: session.uid, source: 'dashboard' });
                return send(res, 200, saved, cors);
            } catch (error) {
                if (error instanceof registry.SettingsError) throw new HttpError(400, error.message, { field: error.field ?? null });
                throw error;
            }
        }
    }

    return send(res, 404, { error: 'Not found.' }, cors);
}

function start(client) {
    const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
    if (missing.length) {
        console.error(`[dashboard] not started, missing: ${missing.join(', ')}`);
        return null;
    }
    registry.setClient(client);
    registry.onChange(({ guildId, section, actor }) => {
        if (actor?.source === 'dashboard') console.log(`[dashboard] ${actor.id} changed ${section} in ${guildId}`);
    });

    const server = http.createServer((req, res) => {
        handle(client, req, res).catch((error) => {
            const cors = { 'Access-Control-Allow-Origin': allowedOrigin(), Vary: 'Origin' };
            if (error instanceof HttpError) return send(res, error.status, { error: error.message, ...error.extra }, cors);
            console.error('[dashboard]', error);
            return send(res, 500, { error: 'Something went wrong.' }, cors);
        });
    });
    server.requestTimeout = 30 * 1000;
    const port = Number(process.env.DASHBOARD_PORT);
    const host = process.env.DASHBOARD_HOST || '127.0.0.1';
    server.listen(port, host, () => console.log(`[dashboard] API listening on http://${host}:${port}`));
    return server;
}

module.exports = { start };
