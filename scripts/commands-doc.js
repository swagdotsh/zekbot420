const fs = require('fs');
const path = require('path');
const { slashCatalog } = require('../commandCatalog');

const OUT = path.join(__dirname, '..', 'COMMANDS.md');

const SECTIONS = [
    {
        title: 'Setting up the bot',
        intro: 'Features are turned on with `/setup <feature>` and off with `/disable <feature>`. Turning something off keeps its settings, so `/setup` brings it back the way it was.',
        commands: ['setup', 'disable', 'prefix'],
    },
    {
        title: 'Welcome, goodbye and boost messages',
        intro: 'Pick the channel with `/setup welcome`, `/setup goodbye` or `/setup boost`, then change the text, embed and image here. Placeholders like `{user}`, `{server}` and `{membercount_ordinal}` are filled in for each member; boost messages also have `{boostcount}` and `{boostlevel}`.',
        commands: ['welcome', 'goodbye', 'boost'],
    },
    {
        title: 'Booster perks',
        intro: 'Perk roles are given when someone boosts and taken back when the boost ends. Only roles the bot gave are taken back. Booster channels are hidden from everyone except Discord\'s Server Booster role.',
        commands: ['boostperks'],
    },
    {
        title: 'Reaction roles and color roles',
        intro: 'Roles with moderator permissions (Administrator, Manage Server, Ban Members and so on) can\'t be given out by reacting. Color roles are created right under the bot\'s highest role so the color shows, and the panel in the colors channel updates every time a color is added or removed. Members can only wear one color at a time.',
        commands: ['reactionrole', 'colorrole'],
    },
    {
        title: 'Community',
        intro: 'Streaks need a channel set with `/setup streaks`; a day runs midnight to midnight in each member\'s `/time timezone` (UTC if they haven\'t set one). Confessions need `/setup confessions`, and bump reminders `/setup bumpreminder`.',
        commands: ['streak', 'confess', 'confession', 'bumpreminder', 'level', 'birthday', 'giveaway', 'starboard', 'stickyroles'],
    },
    {
        title: 'Moderation',
        commands: ['warn', 'timeout', 'jail', 'ban', 'reactionmute', 'snipe', 'react', 'vc'],
    },
    {
        title: 'last.fm',
        intro: 'Link your account once with `/fm connect`. Artist charts and artist pictures use Spotify artist photos when the bot has Spotify keys.',
        commands: ['fm'],
    },
    {
        title: 'Music',
        intro: 'Shazam finds the song in a video or audio file and replies with Apple Music and Spotify links above the result. Long videos are sampled at a few points, so the song doesn\'t need to start at the beginning.',
        commands: ['shazam', 'Shazam', 'metadata'],
    },
    {
        title: 'Movies and TV',
        intro: 'Start typing a title and pick it from the list. Data comes from TMDB.',
        commands: ['movie', 'show'],
    },
    {
        title: 'Social profiles',
        commands: ['social'],
    },
    {
        title: 'Images',
        intro: 'Image effects are powered by [esmBot](https://github.com/esmBot/esmBot) (MIT, see `esmBot/LICENSE`). With no image or link, the bot uses the latest image in the channel. Some effects use `text` (put a comma between top and bottom text), `amount`, `font` or `option`; the effect list shows which.',
        commands: ['image'],
    },
    {
        title: 'Games',
        commands: ['game'],
    },
    {
        title: 'Tools',
        commands: ['time', 'translate', 'emoji', 'user', 'bot', 'fortnite'],
    },
];

const PREFIX = [
    ['`,fm`', 'What you\'re playing on last.fm. `,fm connect` and `,fm disconnect` link and unlink your account.'],
    ['`,am` / `,spotify`', 'Link the song you\'re playing on last.fm on Apple Music or Spotify. Also `,am @user` or `,am <last.fm name>`.'],
    ['`,shazam`', 'Find the song in an attached video or audio file, or in the message you reply to.'],
    ['`,movie <title>` / `,show <title>`', 'Look up a movie or TV show (also `,film`, `,tv` and `,series`).'],
];

const RENAMED = [
    ['/nowplaying', '/fm np'], ['/connectfm', '/fm connect'], ['/disconnectfm', '/fm disconnect'], ['/fmprofile', '/fm profile'],
    ['/cover', '/fm cover'], ['/chart', '/fm chart'], ['/topartists, /topalbums, /toptracks', '/fm topartists, /fm topalbums, /fm toptracks'],
    ['/albumplays, /trackplays', '/fm albumplays, /fm trackplays'], ['/rank, /leaderboard', '/level rank, /level leaderboard'],
    ['/warn, /unwarn, /warnings', '/warn add, /warn remove, /warn list'], ['/timeout, /untimeout', '/timeout add, /timeout remove'],
    ['/jail, /unjail', '/jail add, /jail remove'], ['/ban, /unban', '/ban add, /ban remove'],
    ['/reactionmute, /unreactionmute', '/reactionmute add, /reactionmute remove'], ['/snipe, /rs, /clearsnipe', '/snipe message, /snipe reaction, /snipe clear'],
    ['/react, /removereact, /removeallreacts', '/react add, /react remove, /react clear'], ['/addemoji, /fetchemoji', '/emoji add, /emoji fetch'],
    ['/avatar, /banner, /serveravatar, /serverbanner', '/user avatar, /user banner, /user serveravatar, /user serverbanner'],
    ['/info, /ping, /status, /uptime', '/bot info, /bot ping, /bot status, /bot uptime'],
    ['/lvc, /sl, /rmvc, /kvc, /dvc, /vcban', '/vc lock, /vc limit, /vc rename, /vc kick, /vc delete, /vc ban'],
    ['/convert time, /set timezone, /helptz', '/time convert, /time timezone, /time zones'], ['/remindme, /settimer', '/time remind, /time timer'],
    ['/translate, /badtranslate', '/translate text, /translate bad'], ['/fnstats, /itemshop', '/fortnite stats, /fortnite shop'],
    ['/rps, /tictactoe, /akinator, /flags', '/game rps, /game tictactoe, /game akinator, /game flags'],
    ['/roblox', '/social roblox'],
];

const WHERE = { anywhere: 'Works anywhere, including DMs and servers without the bot', servers: 'Works in servers', 'servers and DMs': 'Works in servers and DMs with the bot' };

const md = (text) => String(text ?? '').replace(/\|/g, '\\|');

function renderCommand(entry) {
    const lines = [`#### \`${entry.usage}\``, '', md(entry.description)];
    if (entry.options.length) {
        lines.push('');
        for (const o of entry.options) {
            const extra = [o.required ? 'required' : 'optional', o.type, o.autocomplete ? 'suggests as you type' : null, o.choices ? `one of: ${o.choices.join(', ')}` : null]
                .filter(Boolean).join(', ');
            lines.push(`- \`${o.name}\` (${extra}): ${md(o.description)}`);
        }
    }
    const meta = [];
    if (entry.permissions.length) meta.push(`Needs ${entry.permissions.join(' and ')}`);
    meta.push(WHERE[entry.where] ?? entry.where);
    lines.push('', `<sub>${meta.join(' - ')}</sub>`, '');
    return lines.join('\n');
}

function build() {
    const catalog = new Map(slashCatalog().map((c) => [c.name, c]));
    const used = new Set();
    const out = [
        '# zekbot420 commands',
        '',
        'Every slash command added on the `features/new-commands` branch, grouped by feature, plus the new prefix commands and a list of commands that moved to a new name. Generated from the command definitions with `npm run docs:commands`.',
        '',
        '## Contents',
        '',
        ...SECTIONS.map((s) => `- [${s.title}](#${s.title.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')})`),
        '- [Prefix commands](#prefix-commands)',
        '- [Renamed commands](#renamed-commands)',
        '',
    ];

    for (const section of SECTIONS) {
        out.push(`## ${section.title}`, '');
        if (section.intro) out.push(section.intro, '');
        for (const name of section.commands) {
            const command = catalog.get(name);
            if (!command) throw new Error(`COMMANDS.md lists /${name}, which doesn't exist.`);
            used.add(name);
            if (command.kind !== 'slash') {
                out.push(`#### ${command.name} (${command.kind})`, '', command.description, '', `<sub>${WHERE[command.where] ?? command.where}</sub>`, '');
                continue;
            }
            out.push(`### /${command.name}`, '', md(command.description), '');
            for (const entry of command.commands) out.push(renderCommand(entry));
        }
    }

    out.push('## Prefix commands', '', 'The default prefix is `,`; each server can change it with `/prefix set`.', '', '| Command | What it does |', '| --- | --- |');
    for (const [usage, what] of PREFIX) out.push(`| ${usage} | ${what} |`);
    out.push('', '## Renamed commands', '', 'These commands still work the same way under their new names.', '', '| Old | New |', '| --- | --- |');
    for (const [before, after] of RENAMED) out.push(`| \`${before}\` | \`${after}\` |`);
    out.push('');

    const missing = [...catalog.keys()].filter((name) => !used.has(name));
    return { text: out.join('\n'), missing };
}

const { text, missing } = build();
fs.writeFileSync(OUT, text);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${text.split('\n').length} lines).`);
if (missing.length) console.log(`Not in COMMANDS.md (older commands): ${missing.map((n) => `/${n}`).join(', ')}`);
