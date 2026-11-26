const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');

const TIMEOUT_MS = 10000;
const PRESENCE = ['Offline', 'Online', 'In game', 'In Studio', 'Invisible'];
const PRESENCE_DOT = ['⚫', '🟢', '🎮', '🛠️', '⚫'];
const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

async function getJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Roblox API ${response.status}`);
    return response.json();
}

const optional = (promise) => promise.catch(() => null);

async function findUserId(query) {
    const trimmed = query.trim().replace(/^@/, '');
    const profileLink = trimmed.match(/roblox\.com\/users\/(\d+)/i)?.[1];
    if (profileLink) return Number(profileLink);
    if (/^\d{1,19}$/.test(trimmed)) return Number(trimmed);

    const result = await getJson('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        body: JSON.stringify({ usernames: [trimmed], excludeBannedUsers: false }),
    });
    return result.data?.[0]?.id ?? null;
}

async function fetchProfile(userId) {
    const user = await getJson(`https://users.roblox.com/v1/users/${userId}`);
    const [friends, followers, following, avatar, headshot, presence, groups] = await Promise.all([
        optional(getJson(`https://friends.roblox.com/v1/users/${userId}/friends/count`)),
        optional(getJson(`https://friends.roblox.com/v1/users/${userId}/followers/count`)),
        optional(getJson(`https://friends.roblox.com/v1/users/${userId}/followings/count`)),
        optional(getJson(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`)),
        optional(getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`)),
        optional(getJson('https://presence.roblox.com/v1/presence/users', { method: 'POST', body: JSON.stringify({ userIds: [userId] }) })),
        optional(getJson(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)),
    ]);

    const image = (data) => (data?.data?.[0]?.state === 'Completed' ? data.data[0].imageUrl : null);
    return {
        user,
        friends: friends?.count,
        followers: followers?.count,
        following: following?.count,
        avatarUrl: image(avatar),
        headshotUrl: image(headshot),
        presence: presence?.userPresences?.[0] ?? null,
        groups: groups?.data ?? [],
    };
}

const count = (n) => (Number.isFinite(n) ? COMPACT.format(n) : '—');

function buildEmbed(profile) {
    const { user } = profile;
    const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;
    const created = Math.floor(new Date(user.created).getTime() / 1000);
    const presenceType = profile.presence?.userPresenceType ?? 0;
    const verified = user.hasVerifiedBadge ? ' ☑️' : '';

    const embed = new EmbedBuilder()
        .setColor(user.isBanned ? 0xed4245 : 0x00a2ff)
        .setAuthor({ name: `@${user.name}`, iconURL: profile.headshotUrl ?? undefined, url: profileUrl })
        .setTitle(`${user.displayName}${verified}`)
        .setURL(profileUrl)
        .setDescription(user.description?.trim() ? user.description.trim().slice(0, 1000) : '*No bio*')
        .addFields(
            { name: 'Friends', value: count(profile.friends), inline: true },
            { name: 'Followers', value: count(profile.followers), inline: true },
            { name: 'Following', value: count(profile.following), inline: true },
            { name: 'Joined', value: Number.isFinite(created) ? `<t:${created}:D> (<t:${created}:R>)` : 'Unknown', inline: true },
            { name: 'Status', value: user.isBanned ? '⛔ Banned' : `${PRESENCE_DOT[presenceType]} ${PRESENCE[presenceType] ?? 'Offline'}`, inline: true },
            { name: 'User ID', value: String(user.id), inline: true },
        )
        .setFooter({ text: 'Roblox' });

    if (profile.groups.length) {
        const list = profile.groups.slice(0, 5).map((g) => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id}) · ${g.role.name}`);
        if (profile.groups.length > 5) list.push(`…and ${profile.groups.length - 5} more`);
        embed.addFields({ name: `Groups (${profile.groups.length})`, value: list.join('\n').slice(0, 1024) });
    }
    if (profile.avatarUrl) embed.setImage(profile.avatarUrl);
    else if (user.isBanned) embed.addFields({ name: 'Avatar', value: 'Not available for banned accounts.' });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Profile').setURL(profileUrl),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Avatar items').setURL(`https://www.roblox.com/users/${user.id}/inventory`),
    );
    return { embeds: [embed], components: [buttons] };
}

async function lookup(query) {
    try {
        const userId = await findUserId(query);
        if (!userId) return { error: `No Roblox user named **${query.replace(/[*_`~|]/g, '')}**.` };
        return buildEmbed(await fetchProfile(userId));
    } catch (error) {
        if (/Roblox API (400|404)/.test(error.message)) return { error: 'That Roblox user doesn\'t exist.' };
        throw error;
    }
}

module.exports = { lookup, findUserId, fetchProfile, buildEmbed };
