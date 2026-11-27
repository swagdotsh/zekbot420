# zekbot420 web dashboard API

The bot comes with the API for its web dashboard at [zekbot420.swagrelated.com](https://zekbot420.swagrelated.com). The API runs inside the bot process, so a setting changed on the dashboard takes effect straight away and is checked with the same rules as the slash commands. The dashboard website is a separate static site that calls this API.

- [Setting it up](#setting-it-up)
- [Logging in](#logging-in)
- [Endpoints](#endpoints)
- [Settings](#settings)
- [Errors and limits](#errors-and-limits)
- [Security](#security)

## Setting it up

The API starts when `DASHBOARD_PORT` is set in `.env`:

```dotenv
DASHBOARD_PORT=3080
DASHBOARD_URL=https://zekbot420.swagrelated.com
DASHBOARD_API_URL=https://api-zekbot420.swagrelated.com
DASHBOARD_SECRET=
DISCORD_CLIENT_SECRET=
# Optional
DASHBOARD_HOST=127.0.0.1
DASHBOARD_TRUST_PROXY=1
```

| Variable | What it is |
| --- | --- |
| `DASHBOARD_PORT` | Port the API listens on |
| `DASHBOARD_HOST` | Address it listens on. Defaults to `127.0.0.1`, so only a reverse proxy on the same machine can reach it |
| `DASHBOARD_URL` | The dashboard website. Only this site can call the API, and logins send people back here |
| `DASHBOARD_API_URL` | Where the API is reachable from the internet. Since the dashboard is static hosting, the API needs its own address on the bot's server |
| `DASHBOARD_SECRET` | At least 32 random characters, used to sign logins. Make one with `openssl rand -hex 32`. Changing it logs everyone out |
| `DISCORD_CLIENT_SECRET` | Discord developer portal > your app > OAuth2 > Client Secret |
| `DASHBOARD_TRUST_PROXY` | Set to `1` when the API is behind a reverse proxy, so rate limits use the visitor's IP instead of the proxy's |

Then:

1. In the Discord developer portal > your app > OAuth2 > Redirects, add `https://api-zekbot420.swagrelated.com/auth/callback` (your `DASHBOARD_API_URL` followed by `/auth/callback`).
2. Point `api-zekbot420.swagrelated.com` at the bot's server and put a reverse proxy with HTTPS in front of the port. With [Caddy](https://caddyserver.com), the whole config is:

   ```text
   api-zekbot420.swagrelated.com {
       reverse_proxy 127.0.0.1:3080
   }
   ```

3. Restart the bot. It logs `[dashboard] API listening on http://127.0.0.1:3080`. If something is missing it logs which variables instead, and the bot keeps running without the API.

## Logging in

Logins use Discord. The API asks for the `identify` and `guilds` scopes, so it can see who the person is and which servers they share with the bot.

1. Send people to `https://api-zekbot420.swagrelated.com/auth/login`.
2. After they approve on Discord, they come back to `https://zekbot420.swagrelated.com/#token=...`.
3. Read the token from the address, remove it from the address bar, and keep it (for example in `localStorage`).
4. Send it on every request as `Authorization: Bearer <token>`.

If the login fails or is cancelled, the address has `#error=...` with a message to show instead. A login lasts 7 days; after that the API answers `401` and they log in again. To log out, delete the token.

```js
const API = 'https://api-zekbot420.swagrelated.com';

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('token')) {
    localStorage.setItem('token', hash.get('token'));
    history.replaceState(null, '', location.pathname);
}

async function api(path, options = {}) {
    const response = await fetch(API + path, {
        ...options,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (response.status === 401) location.href = `${API}/auth/login`;
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error), { field: body.field });
    return body;
}

const me = await api('/api/me');
```

## Endpoints

| Request | Login | Returns |
| --- | --- | --- |
| `GET /api/health` | no | Whether the bot is up |
| `GET /api/commands` | no | Every slash and prefix command, for a commands page |
| `GET /api/settings/schema` | no | Every settings section and its fields, to build forms from |
| `GET /api/me` | yes | The person and the servers they share with the bot |
| `GET /api/guilds/:id` | yes | A server's name, icon, channels and roles |
| `GET /api/guilds/:id/settings` | yes | The current values of the sections they can change |
| `PATCH /api/guilds/:id/settings/:section` | yes | Saves some fields of one section |

### `GET /api/health`

```json
{ "ok": true, "ready": true, "guilds": 42 }
```

### `GET /api/commands`

Built from the same definitions Discord gets, so it's always current. Use it for the site's command list.

```json
{
  "slash": [
    {
      "name": "fm",
      "kind": "slash",
      "description": "last.fm: what you're playing, your stats and linking your account",
      "where": "anywhere",
      "commands": [
        {
          "usage": "/fm np",
          "description": "Show your current or most recently played track",
          "options": [{ "name": "username", "type": "text", "required": false, "description": "last.fm username (optional if linked)", "choices": null, "autocomplete": false }],
          "permissions": [],
          "where": "anywhere"
        }
      ]
    }
  ],
  "prefix": [{ "name": "nowplaying", "aliases": ["np", "fm", "lastplayed"], "category": "lastfm" }]
}
```

`where` is `servers`, `servers and DMs` or `anywhere` (including DMs and servers without the bot). Right-click commands have `kind` `message menu` and no `commands`.

### `GET /api/me`

```json
{
  "user": { "id": "1234", "name": "zekkie", "username": "zekkie", "avatar": "a1b2c3" },
  "guilds": [
    { "id": "5678", "name": "My server", "icon": "https://cdn.discordapp.com/icons/...", "canManage": true, "sections": ["general", "welcome", "streaks"] }
  ]
}
```

The avatar image is `https://cdn.discordapp.com/avatars/<id>/<avatar>.png`. Servers the person can change something in come first. `sections` lists the settings sections they're allowed to change there.

### `GET /api/guilds/:id`

```json
{
  "id": "5678",
  "name": "My server",
  "icon": "https://cdn.discordapp.com/icons/...",
  "memberCount": 1234,
  "boostLevel": 2,
  "channels": [{ "id": "1111", "name": "general", "type": 0, "parentId": null, "botCanSend": true }],
  "roles": [{ "id": "2222", "name": "Pink", "color": "#ff66cc", "position": 12, "managed": false, "botCanAssign": true }],
  "sections": ["general", "welcome", "streaks"]
}
```

Use `channels` and `roles` for pickers. Channel `type` is Discord's channel type: `0` text, `2` voice, `4` category, `5` announcement, `13` stage, `15` forum. Show only channels with `botCanSend` for settings that post messages, and only roles with `botCanAssign` for roles the bot hands out.

### `GET /api/guilds/:id/settings`

```json
{
  "general": { "prefix": "," },
  "streaks": { "channelId": "1111", "minDays": 2 },
  "leveling": null
}
```

A section is `null` when it couldn't be loaded right now (for example the database is down). Show it as unavailable and let the rest of the page work.

### `PATCH /api/guilds/:id/settings/:section`

Send only the fields that changed. The answer is the whole section as saved.

```http
PATCH /api/guilds/5678/settings/streaks
Authorization: Bearer <token>
Content-Type: application/json

{ "channelId": "1111", "minDays": 3 }
```

```json
{ "channelId": "1111", "minDays": 3 }
```

Send `null` to clear a field (for example a channel, which turns that feature off).

## Settings

`GET /api/settings/schema` describes every section:

```json
[
  {
    "id": "streaks",
    "label": "Message streaks",
    "description": "Members keep a streak by sending a message every day. Streaks are announced in a channel.",
    "permission": "ManageGuild",
    "fields": [
      { "key": "channelId", "type": "channel", "label": "Announcement channel (empty = off)", "default": null },
      { "key": "minDays", "type": "number", "label": "Announce from this many days", "default": 2, "min": 1, "max": 365, "integer": true }
    ]
  }
]
```

| Section | What it covers | Needs |
| --- | --- | --- |
| `general` | The prefix for message commands | Manage Server |
| `socialEmbeds` | X, Instagram and TikTok link embeds: on or off, which platforms, hiding Discord's own preview, and `trigger`, which is `"mention"` (only `zekbot <link>`, `zekbot420`, `zkb`, `zk`, `420` or a ping, the default) or `"auto"` (every link) | Manage Server |
| `welcome`, `goodbye`, `boost` | The channel, text, embed, color, image and avatar of each message | Manage Server |
| `bumpReminders` | Bump reminders: on or off, channel, role to ping and the reminder text | Manage Server |
| `confessions` | The confession channel | Manage Server |
| `streaks` | The streak channel and from which day streaks are announced | Manage Server |
| `colorRoles` | The channel the color role panel is in. Changing it moves the panel, clearing it removes the panel. Colors are added with `/colorrole` | Manage Roles |
| `boostPerks` | Roles boosters get. Adding a role gives it to current boosters, removing one takes it back from those who got it from boosting | Manage Server |
| `downloads` | Whether members can download videos with `/download` (off by default) | Manage Server |
| `modlog` | The mod log channel | Administrator |
| `trap` | Roles that can post in the trap channel without being banned. The channel and ban count are read only | Manage Server |
| `leveling` | On or off, level-up channel, XP per message, leaderboard and level roles (`roles` is a `list` of `{ level, roleId }`). Turning it off keeps XP and level roles but resets the other settings | Manage Server |
| `starboard` | Channel (empty turns it off), reactions needed, self-stars and the emoji | Manage Server |
| `birthdays` | The announcement channel and birthday role | Manage Roles |
| `tickets` | Support roles, transcript log channel and open tickets per member. Only works after `/ticket setup`; `setUp` and `categoryId` are read only. Changing support roles updates who can see the category and log channel | Manage Server |
| `tts` | An extra text channel read out by `/tts`, besides the voice channel's chat | Manage Server |
| `stickyRoles` | On or off and the roles members get back when they rejoin | Manage Roles |
| `sportsAlerts` | Where NFL and NBA follow pings go for members who made this their home server (empty = DMs) | Manage Server |
| `jail`, `reactionMute`, `voicemaster` | Read only: whether they're set up and the channels and roles they made. They're set up and removed with `/setup` and `/disable`, because that creates roles and channels | Manage Roles (VoiceMaster: Manage Channels) |

Field types:

| Type | Value |
| --- | --- |
| `string`, `text` | Text (`text` is multi-line). May have `minLength`, `maxLength` and `pattern` |
| `boolean` | `true` or `false` |
| `number` | A number between `min` and `max`; whole if `integer` is `true` |
| `color` | A hex color like `#00ff88` |
| `url` | An `http` or `https` link |
| `enum` | One of the `value`s in `options` |
| `channel`, `role` | A channel or role ID from that server |
| `channels`, `roles` | A list of IDs, at most `maxItems` |
| `list` | A list of objects, at most `maxItems`. Each object's keys are described by the field's own `fields`, and no two objects can share the value of `uniqueBy` |

Fields with `readOnly: true` are shown but can't be changed; sending one is a `400`. A `channel` field may have `channelTypes`, the channel types it can be. Without it, it's a text or announcement channel.

The server owner and anyone with the section's permission can change it.

## Errors and limits

Errors come back as JSON with a message you can show as it is:

```json
{ "error": "Announcement channel (empty = off): that channel isn't in this server.", "field": "channelId" }
```

| Status | Meaning |
| --- | --- |
| `400` | Something in the request isn't valid. `field` says which setting, when there is one |
| `401` | Not logged in, or the login expired |
| `403` | They don't have permission to change that |
| `404` | The server isn't shared with the bot, or the address doesn't exist |
| `413` | The request is bigger than 64 KB |
| `415` | The request isn't JSON |
| `429` | More than 90 requests a minute from one IP. Wait for `Retry-After` seconds |

## Security

- Permissions are checked against the person's current permissions in the server on every request, not only at login, so taking away someone's role takes away their dashboard access too.
- Channels must be in that server, and the bot must be able to post in them. Roles the bot hands out must be below its highest role, can't be managed by an integration and can't have moderator permissions.
- Only `DASHBOARD_URL` can call the API from a browser.
- Logins are signed with `DASHBOARD_SECRET` and can't be edited or forged. The API never sees or keeps Discord passwords or Discord access tokens after login.
- Every change made on the dashboard is logged as `[dashboard] <user id> changed <section> in <server id>`.
