const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const API = 'https://api.github.com';
const TIMEOUT_MS = 10000;
const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const REPO_NAME = /^[\w.-]{1,100}$/;

class LookupError extends Error {}

async function gh(pathname) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'zekbot420-discord-bot',
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(API + pathname, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 429) {
        const reset = Number(response.headers.get('x-ratelimit-reset'));
        const when = reset ? ` Try again <t:${reset}:R>.` : '';
        throw new LookupError(`GitHub's rate limit was hit.${when}`);
    }
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    return response.json();
}

const optional = (promise) => promise.catch(() => null);
const count = (n) => (Number.isFinite(n) ? COMPACT.format(n) : '—');
const ts = (date) => Math.floor(Date.parse(date) / 1000);
const clip = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

function parseUser(input) {
    const text = String(input ?? '').trim().replace(/^@/, '');
    const fromLink = text.match(/github\.com\/([a-z\d-]{1,39})(?:[/?#]|$)/i)?.[1];
    const name = fromLink ?? text;
    return USERNAME.test(name) ? name : null;
}

function parseRepo(input) {
    const text = String(input ?? '').trim();
    const match = text.match(/github\.com\/([a-z\d-]{1,39})\/([\w.-]{1,100}?)(?:\.git)?(?:[/?#]|$)/i)
        ?? text.match(/^([a-z\d-]{1,39})\/([\w.-]{1,100}?)(?:\.git)?$/i);
    if (!match || !USERNAME.test(match[1]) || !REPO_NAME.test(match[2])) return null;
    return { owner: match[1], repo: match[2] };
}

async function profile(input) {
    const login = parseUser(input);
    if (!login) return { error: 'Give a GitHub username or profile link, like `octocat`.' };

    const user = await gh(`/users/${login}`);
    if (!user) return { error: `There's no GitHub user called **${login}**.` };

    const repos = await optional(gh(`/users/${login}/repos?per_page=100&sort=pushed&type=owner`));
    const own = (repos ?? []).filter((r) => !r.fork);
    const stars = own.reduce((sum, r) => sum + r.stargazers_count, 0);
    const top = [...own].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 4);
    const languages = Object.entries(own.reduce((acc, r) => {
        if (r.language) acc[r.language] = (acc[r.language] ?? 0) + 1;
        return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([lang]) => lang);

    const isOrg = user.type === 'Organization';
    const embed = new EmbedBuilder()
        .setColor(0x24292f)
        .setAuthor({ name: isOrg ? 'GitHub organization' : 'GitHub', iconURL: 'https://github.githubassets.com/favicons/favicon.png' })
        .setTitle(user.name ? `${user.name} (@${user.login})` : `@${user.login}`)
        .setURL(user.html_url)
        .setThumbnail(user.avatar_url)
        .setDescription(clip(user.bio?.trim(), 500) || '*No bio*');

    const fields = [
        { name: 'Repositories', value: count(user.public_repos), inline: true },
        { name: 'Followers', value: count(user.followers), inline: true },
        { name: isOrg ? 'Stars' : 'Following', value: isOrg ? count(stars) : count(user.following), inline: true },
    ];
    if (!isOrg && repos) fields.push({ name: 'Stars earned', value: count(stars), inline: true });
    fields.push({ name: 'Joined', value: `<t:${ts(user.created_at)}:D>`, inline: true });

    const about = [
        user.company && `🏢 ${clip(user.company, 60)}`,
        user.location && `📍 ${clip(user.location, 60)}`,
        user.blog && `🔗 ${clip(user.blog.startsWith('http') ? user.blog : `https://${user.blog}`, 100)}`,
        user.twitter_username && `🐦 [@${user.twitter_username}](https://x.com/${user.twitter_username})`,
    ].filter(Boolean);
    if (about.length) fields.push({ name: 'About', value: about.join('\n') });
    if (languages.length) fields.push({ name: 'Top languages', value: languages.join(', ') });
    if (top.length) {
        fields.push({
            name: 'Top repositories',
            value: top.map((r) => `[${r.name}](${r.html_url}) ⭐ ${count(r.stargazers_count)}${r.language ? ` - ${r.language}` : ''}`).join('\n'),
        });
    }
    embed.addFields(fields);

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Profile').setURL(user.html_url),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Repositories').setURL(`${user.html_url}?tab=repositories`),
    );
    return { embeds: [embed], components: [buttons] };
}

async function repository(input) {
    const parsed = parseRepo(input);
    if (!parsed) return { error: 'Give a repository as `owner/name` or a GitHub link, like `discordjs/discord.js`.' };

    const repo = await gh(`/repos/${parsed.owner}/${parsed.repo}`);
    if (!repo) return { error: `There's no public repository called **${parsed.owner}/${parsed.repo}**.` };

    const [languages, release] = await Promise.all([
        optional(gh(`/repos/${repo.full_name}/languages`)),
        optional(gh(`/repos/${repo.full_name}/releases/latest`)),
    ]);

    const badges = [repo.archived && '📦 Archived', repo.fork && '🍴 Fork', repo.is_template && '📋 Template'].filter(Boolean);
    const embed = new EmbedBuilder()
        .setColor(0x24292f)
        .setAuthor({ name: repo.owner.login, iconURL: repo.owner.avatar_url, url: repo.owner.html_url })
        .setTitle(repo.full_name)
        .setURL(repo.html_url)
        .setDescription([badges.join(' - '), clip(repo.description?.trim(), 600) || '*No description*'].filter(Boolean).join('\n'));

    const fields = [
        { name: 'Stars', value: `⭐ ${count(repo.stargazers_count)}`, inline: true },
        { name: 'Forks', value: `🍴 ${count(repo.forks_count)}`, inline: true },
        { name: 'Watchers', value: `👀 ${count(repo.subscribers_count)}`, inline: true },
        { name: 'Open issues', value: count(repo.open_issues_count), inline: true },
        { name: 'Created', value: `<t:${ts(repo.created_at)}:D>`, inline: true },
        { name: 'Last push', value: `<t:${ts(repo.pushed_at)}:R>`, inline: true },
    ];

    const total = Object.values(languages ?? {}).reduce((a, b) => a + b, 0);
    if (total) {
        const parts = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([lang, bytes]) => `${lang} ${((bytes / total) * 100).toFixed(1)}%`);
        fields.push({ name: 'Languages', value: parts.join(' - ') });
    } else if (repo.language) {
        fields.push({ name: 'Language', value: repo.language, inline: true });
    }
    if (repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION') fields.push({ name: 'License', value: repo.license.spdx_id, inline: true });
    if (release?.tag_name) fields.push({ name: 'Latest release', value: `[${clip(release.name || release.tag_name, 60)}](${release.html_url}) <t:${ts(release.published_at)}:R>`, inline: true });
    if (repo.fork && repo.parent) fields.push({ name: 'Forked from', value: `[${repo.parent.full_name}](${repo.parent.html_url})`, inline: true });
    if (repo.topics?.length) fields.push({ name: 'Topics', value: clip(repo.topics.slice(0, 12).map((t) => `\`${t}\``).join(' '), 1024) });
    embed.addFields(fields.slice(0, 25)).setImage(`https://opengraph.githubassets.com/1/${repo.full_name}`);

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Repository').setURL(repo.html_url),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Issues').setURL(`${repo.html_url}/issues`),
    );
    if (repo.homepage && /^https?:\/\//.test(repo.homepage)) {
        buttons.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Website').setURL(repo.homepage));
    }
    return { embeds: [embed], components: [buttons] };
}

module.exports = { profile, repository, parseUser, parseRepo, LookupError };
