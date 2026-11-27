<div align="center">

<img width="128" height="128" alt="6ce517a4d6c725cd1b7cb51a4e4a1465" src="https://github.com/user-attachments/assets/9b181455-dc7a-4f1c-907d-ae573f10a8f6" />

# zekbot420
Learn more at: [zekbot420.swagrelated.com](https://zekbot420.swagrelated.com)

<br />

<img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues/swagdotsh/zekbot420?style=for-the-badge" />
<img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/swagdotsh/zekbot420?style=for-the-badge" />
<img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/swagdotsh/zekbot420?style=for-the-badge" />
<img alt="GitHub License" src="https://img.shields.io/github/license/swagdotsh/zekbot420?style=for-the-badge" />
<img alt="GitHub top language" src="https://img.shields.io/github/languages/top/swagdotsh/zekbot420?style=for-the-badge" />
<img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/swagdotsh/zekbot420?style=for-the-badge" />
<img alt="GitHub contributors" src="https://img.shields.io/github/contributors-anon/swagdotsh/zekbot420?style=for-the-badge" />

Your favorite Discord bot's open-source alternative.
<br><br><a href="https://top.gg/bot/939283468322484274">
  <img src="https://top.gg/api/widget/939283468322484274.svg">
</a>
<br />
</div>

## Features

Every command, with its options and permissions, is in [COMMANDS.md](COMMANDS.md).

### Moderation & management
- Ban / unban
- Kick
- Auto-Mod
- Timeout / untimeout
- Clear messages
- Warn system (warn, unwarn, list warnings)
- Jail system
- Sticky roles system
- Giveaway system
- Starboard system
- Reaction roles
- Color roles
- VC bans

### Leveling
- Leveling system 
- Leaderboards
- Configurable XP system
- Role rewards

### Utility & Info
- Ping / uptime
- Avatar lookup
- Polls
- Downloads (only on your own hosted instance, not main :/ ) 
- Help command
- Basic server/user info
- Translation (translate messages and text to almost any language)
- Emoji fetcher
- AFK System
- Birthday tracker
- Audio metadata viewer and editor

### Logging 
- Logs support (stores moderation actions)
- Welcome and goodbye messages
- `snipe` / `editsnipe` message recall for deleted and edited messages

### Community
- Boost messages
- Booster perks
- Message streaks
- Anonymous confessions
- Bump reminders

### Games
- Guess the flag
- Tic-tac-toe
- Rock paper scissors
- Akinator

### Lookups
- Movies and TV shows
- Social profiles (GitHub, X, Instagram, Roblox, sandbox)
- Shazam song recognition

### Images
- Image effects (powered by [esmBot](https://github.com/esmBot/esmBot))

### Social embeds (opt-in)
- X/Twitter, Instagram and TikTok post embeds with captions and media, on demand with `zekbot <link>` or for every link

### Integrations
- last.fm login and commands (optional; requires API key)
- Apple Music and Spotify links for what you're playing
- Fortnite item shop and player stats (optional; requires [fnbr.co](https://fnbr.co/api/docs) and [fortnite-api](https://fortnite-api.com) API keys, respectively)
- Rainbow Six Siege stats (optional; requires an [r6.arenyze.com](https://r6.arenyze.com/) API key)

### Web dashboard
- Change server settings from [zekbot420.swagrelated.com](https://zekbot420.swagrelated.com) (see [DASHBOARD.md](DASHBOARD.md))

### Voice
#### Audio playback
- Audio file playback in VC 
- Info to see sample rate, bitrate, etc. of currently playing track
- Queue system
- Skip, stop, pause, resume controls
- YouTube, SoundCloud and Spotify searches and links
- Spotify album/playlist queueing (playlists require a Spotify login)
- Playback buttons, track/queue looping, and automatic cleanup when voice channels empty

#### VoiceMaster
- Setup a "Join to Create" voice channel system
- Lock/unlock voice channels, kick users from channels, rename channels
- Usable by any server member

### Text-to-speech
- Read voice channel chats and an optional text channel aloud
- Per-user voices, language/region voice lists, and skip controls
- Prefix commands plus `/tts` subcommands

### Support tickets
- Ticket panels, private support channels, support roles, and transcripts
- Claim, rename, add/remove participants, and close tickets
- Prefix commands plus `/ticket` subcommands

### Sports notifications
- Follow NFL and NBA players and teams
- Big-play and game notifications in DMs or a configured server channel
- `favplayer`, `favteam`, `nbaplayer`, `nbateam`, and `sportsnotify`

### Setting things up
- Per-server prefix (`/prefix set`)
- Turn features on and off with `/setup` and `/disable`

### Downloading
- Download and share videos from pretty much any video service. [_If yt-dlp supports it, we got it!_](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) (optional; requires yt-dlp and ffmpeg)

---

## Requirements

- [**Node.js**](https://nodejs.org/en) (22.12.0 or later; the production server runs Node 22)
- **npm** (comes with Node.js)
- [**A Discord application + bot token**](https://discord.com/developers/applications)
- **Permissions to add a bot to a server** (usually a role with `Manage Server`, or you can create a test server)
- [**Neon**](https://neon.tech) (or another Postgres-compatible database; required by the current bot)

### Optional (depending on your use case)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp/) (required for online music extraction and optional video downloads)
- FFmpeg (a static binary installs with the dependencies) and `ffprobe` on your PATH for music metadata
- [last.fm API key](https://www.last.fm/api) (for last.fm integration features)
- [TMDB API read access token](https://www.themoviedb.org/settings/api) (for `/movie` and `/show`)
- For `/image`: [libvips](https://www.libvips.org/) with its C++ headers, fontconfig, pkg-config, CMake and a C++ compiler, then `npm run build:esmbot` once (and again after updating esmBot/). On macOS: `brew install vips pkg-config cmake`, and build with `PKG_CONFIG_PATH="$(brew --prefix libarchive)/lib/pkgconfig" npm run build:esmbot` (Homebrew keeps libarchive, which vips needs, out of pkg-config's default path). On Debian/Ubuntu: `apt install libvips-dev libfontconfig-dev pkg-config cmake g++`. Add liblqr (`brew install liblqr` / `apt install liblqr-1-0-dev`) before building to get the `magik` effect
---

## Setting Up

See [Getting Started](https://github.com/swagdotsh/zekbot420/wiki/Getting-Started) for installation and [Configuration](https://github.com/swagdotsh/zekbot420/wiki/Configuration) for environment variables and optional integrations.

```sh
npm ci
```

Create `.env` in the project root with your own values:

```dotenv
TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_application_id
# Optional: the default prefix for servers that haven't set one (default ,)
PREFIX=,
NEON_DATABASE_URL=postgresql://your_connection_string
# Optional: use a development server for guild command registration
GUILD_ID=your_test_server_id
# Optional: max shared database connections (default 10)
DB_POOL_MAX=10
# Optional: verbose music playback logging for troubleshooting
MUSIC_DEBUG=1
# Optional: the device icon next to the bot's status: vr (default), mobile or desktop
BOT_PLATFORM=vr
# Optional: a LibreTranslate server for /translate (and its key, if it needs one)
LIBRETRANSLATE_URL=https://your-libretranslate-server
LIBRETRANSLATE_KEY=
# Optional: TMDB for /movie and /show (the read access token, or the older API key)
TMDB_READ_ACCESS_TOKEN=
TMDB_API_KEY=
# Optional: the country for age ratings and where-to-watch (default US)
TMDB_REGION=US
# Optional: the web dashboard API (see "Web dashboard" below)
DASHBOARD_PORT=
DASHBOARD_URL=https://zekbot420.swagrelated.com
DASHBOARD_API_URL=https://api.zekbot420.swagrelated.com
DASHBOARD_SECRET=
DISCORD_CLIENT_SECRET=
# Optional: a sandbox app token for /social sandbox (raises the limit from 120 to 600 lookups a minute)
SANDBOX_API_TOKEN=
# Optional: a GitHub token for /social github (raises the limit from 60 to 5000 lookups an hour)
GITHUB_TOKEN=
```

`BOT_PLATFORM` uses an undocumented Discord behavior (the device the bot reports when it connects), so it may stop working without notice. It only changes after a full restart.

`TOKEN` and `NEON_DATABASE_URL` are required to start. Database tables are created automatically on first start. Command registration also requires `DISCORD_CLIENT_ID`. Keep `.env` and `data/` private and backed up.

## Running the bot

For a foreground session:

```sh
node index.js
```

For a persistent deployment:

```sh
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the privileged command printed by `pm2 startup` to enable boot recovery for the current user. PM2 restarts crashes after five seconds; the saved process list is restored at boot. The configuration also restarts the bot above 750 MB of memory. See [Deployment](https://github.com/swagdotsh/zekbot420/wiki/Deployment) for Linux service recovery, updates, and checks.

Register slash commands after adding or changing them:

```sh
node deploy-commands.js --global
```

Without `--global`, the script uses `GUILD_ID` when configured. Browse the [command list](https://zekbot420.swagrelated.com/commands/) or the guides for [music](https://github.com/swagdotsh/zekbot420/wiki/Playing-Music), [TTS](https://github.com/swagdotsh/zekbot420/wiki/Text-to-Speech), [tickets](https://github.com/swagdotsh/zekbot420/wiki/Tickets), and [sports](https://github.com/swagdotsh/zekbot420/wiki/Sports).

---
## Web dashboard

The bot includes the API for the web dashboard at [zekbot420.swagrelated.com](https://zekbot420.swagrelated.com): log in with Discord and change a server's settings from the browser, checked with the same rules as the slash commands. It starts when `DASHBOARD_PORT` and the other `DASHBOARD_` settings are in `.env`. Setup, logging in, every endpoint and the settings it covers are in [DASHBOARD.md](DASHBOARD.md).

## Data & Persistence

Some features store data locally (for example: warnings/modlog/last.fm configuration/audio files) and others on a PostgreSQL-database. For the local data, you’ll see data files under the `data/` directory.
> [!CAUTION]
> Keep this folder on `.gitignore` to avoid accidentally committing sensitive data. `data/confessions.json` stores who wrote each confession (so `/confession ban` works), so treat it as private.

---

## Project Structure

- `index.js` — bot entry point
- `ecosystem.config.cjs` — PM2 process and recovery configuration
- `musicPlayer.js` / `musicSources.js` / `musicControls.js` — playback, sources, and buttons
- `voiceConnection.js` — shared voice join, reconnect, and disconnect handling for music and TTS
- `db.js` — the shared Postgres connection pool
- `jsonStore.js` / `paths.js` — safe JSON file storage under `data/`
- `reminders.js` — persistent reminders and timers
- `safeFetch.js` — size-limited downloads that refuse private addresses
- `spotify.js` / `spotify-auth.js` — Spotify API and playlist login
- `ttsHandler.js` — text-to-speech sessions and voices
- `ticketHandler.js` — tickets and transcripts
- `nflHandler.js` / `espn.js` — sports subscriptions and ESPN data
- `commands/` — message/prefix style commands (organized by category)
- `slashCommands/` — slash command handlers/definitions
- `welcomeStore.js` / `events/welcoming.js` — welcome message settings, placeholders and sending
- `socialEmbeds.js` — opt-in X/Instagram/TikTok link embeds
- `commandGroup.js` / `slashLoader.js` / `slashCommands/groups/` — groups existing commands under one name (`/setup`, `/disable`, ...) and loads slash commands
- `platformIcon.js` — the `BOT_PLATFORM` status icon
- `ui.js` — shared reply wording and emoji
- `prefix.js` — per-server prefixes; `currentPrefix()` gives the prefix of the server a command is running in
- `settings/` — one registry of every server setting (type, default, validation), used by slash commands and meant for the web panel; see the notes at the top of `settings/index.js`
- `shazam.js` — song recognition for videos and audio
- `guildDataStore.js` — per-server JSON storage for features that don't need Postgres
- `confessions.js` / `bumpReminders.js` / `vcBans.js` — confessions, bump reminders and VC bans (stored in `data/`)
- `audioMetadata.js` / `mp4Advisory.js` — audio tag reading/writing and the M4A explicit/clean atom
- `boosts.js` — boost messages and booster perks (`data/boostPerks.json`)
- `reactionRoles.js` / `colorRoles.js` — reaction roles and the color role panel (`data/reactionRoles.json`, `data/colorRoles.json`)
- `streaks.js` — daily message streaks (`data/streaks.json`)
- `tmdb.js` — movie and TV lookups
- `dashboard/` — the web dashboard API and Discord login (documented in DASHBOARD.md)
- `commandCatalog.js` / `scripts/commands-doc.js` — the list of every command, used by the dashboard API and to write COMMANDS.md (`npm run docs:commands`)
- `social/` — `/social` lookups, one file per platform (GitHub, X, Instagram, Roblox, sandbox)
- `esmbotMedia.js` / `esmbotWorker.js` / `esmBot/` — `/image` effects, the background process that runs them (so a crash there can't take the bot down), and the vendored esmBot image natives
- `storesnipe.js` / `snipe.js` — message snipe support
- `deploy-commands.js` — registers slash commands with Discord
- `geninv.js` — prints an invite link with only the permissions the bot uses (`--admin` for Administrator)
- `data/` — local storage (warnings, modlog, downloads, audio)
- `events/` — handlers for leveling XP (text, voice) & jail timing
- `stickyrolesDbHndlr.js` — Postgres database handler for sticky roles
- `stickyrolesHandler.js` — primary sticky roles manager
- `jailHandler.js` — Postgres database and primary manager for the jail system
- `leveling.js` — Postgres database and primary manager for the leveling system

---

## Credits

- `/image` uses the image processing code from [esmBot](https://github.com/esmBot/esmBot) by TheEssem, under the MIT License. The vendored code, fonts and images are in `esmBot/`, with the license in [`esmBot/LICENSE`](esmBot/LICENSE). Every edited image says "Modifying image through esmBot..." while it's being made.
- Movie and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.

---

## Common Issues

### Bot starts but regular/slash commands don’t work
- Confirm the bot is invited with the right scopes/permissions:
    - `bot`
    - `applications.commands` (for slash commands)
- Re-run command deployment (if slash commands don't worK):
```shell script
node deploy-commands.js
```
If your instance of zekbot420 is in multiple servers, add a `global` at the end for it to deploy everywhere your bot is added.
```shell script
node deploy-commands.js --global
```

### “Missing Access” / permission errors
- Ensure the bot role is high enough in the server role hierarchy
- Ensure the bot has permission to manage messages/moderate members where needed

### Intents-related issues
- Make sure the required Gateway Intents are enabled in the Discord Developer Portal for your bot (and configured in code if applicable)

## Support
If you have issues that aren't listed here or just have general questions, visit the bot's [support page](https://zekbot420.swagrelated.com/support).

---

## Contributing

Contributions are welcome—bug fixes, new commands, improvements to docs, etc.

Suggested workflow:
1. Fork the repo
2. Create a feature branch
3. Make changes
4. Open a PR with a clear description and testing notes

---

## License

This project is licensed under the MIT license.

---
