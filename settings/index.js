const registry = require('./registry');
const { defineSection } = registry;
const { DEFAULT_PREFIX, VALID_PREFIX, MAX_LENGTH, getPrefix, setPrefix } = require('../prefix');
const social = require('../socialEmbeds');
const { getMessageConfig, updateMessageConfig, DEFAULTS: MEMBER_MESSAGE_DEFAULTS } = require('../welcomeStore');
const { store: bumpStore } = require('../bumpReminders');
const { store: confessionStore } = require('../confessions');
const { store: streakStore } = require('../streaks');
const { PermissionFlagsBits } = require('discord.js');
const colorRoles = require('../colorRoles');
const { perkStore, grantPerks, revokePerks } = require('../boosts');

defineSection({
    id: 'general',
    label: 'General',
    description: 'Basic bot settings for this server.',
    fields: [
        {
            key: 'prefix', type: 'string', label: 'Command prefix', default: DEFAULT_PREFIX,
            required: true, minLength: 1, maxLength: MAX_LENGTH, pattern: VALID_PREFIX,
            patternMessage: `The prefix can be 1-${MAX_LENGTH} characters, with no spaces or \` * _ ~ | < > @ # : \\.`,
        },
    ],
    load: async (guildId) => ({ prefix: getPrefix(guildId) }),
    save: async (guildId, values) => {
        if ('prefix' in values) await setPrefix(guildId, values.prefix);
    },
});

defineSection({
    id: 'socialEmbeds',
    label: 'Social embeds',
    description: 'Reply to X and Instagram links with the post text, photos and videos.',
    fields: [
        { key: 'enabled', type: 'boolean', label: 'Enabled', default: false },
        { key: 'x', type: 'boolean', label: 'X / Twitter links', default: true },
        { key: 'instagram', type: 'boolean', label: 'Instagram links', default: true },
        { key: 'hideOriginalEmbed', type: 'boolean', label: 'Hide Discord\'s own link preview', default: false },
    ],
    load: (guildId) => social.getConfig(guildId),
    save: (guildId, values) => social.setConfig(guildId, values),
});

function memberMessageSection(kind, label, description) {
    const defaults = MEMBER_MESSAGE_DEFAULTS[kind];
    const embedKeys = ['title', 'description', 'footer', 'color', 'image', 'avatar'];
    return defineSection({
        id: kind,
        label,
        description,
        fields: [
            { key: 'channelId', type: 'channel', label: 'Channel (empty = off)', default: null },
            { key: 'message', type: 'text', label: 'Message text', default: defaults.message, maxLength: 2000 },
            { key: 'embedEnabled', type: 'boolean', label: 'Show embed', default: defaults.embed.enabled },
            { key: 'title', type: 'string', label: 'Embed title', default: defaults.embed.title, maxLength: 256 },
            { key: 'description', type: 'text', label: 'Embed description', default: defaults.embed.description, maxLength: 4000 },
            { key: 'footer', type: 'string', label: 'Embed footer', default: defaults.embed.footer, maxLength: 2048 },
            { key: 'color', type: 'color', label: 'Embed color', default: defaults.embed.color },
            { key: 'image', type: 'url', label: 'Embed image', default: null },
            { key: 'avatar', type: 'boolean', label: 'Show the member\'s avatar', default: defaults.embed.avatar },
        ],
        load: async (guildId) => {
            const config = await getMessageConfig(guildId, kind);
            return {
                channelId: config.channelId,
                message: config.message,
                embedEnabled: config.embed.enabled,
                ...Object.fromEntries(embedKeys.map((key) => [key, config.embed[key]])),
            };
        },
        save: (guildId, values) => updateMessageConfig(guildId, kind, (config) => {
            if ('channelId' in values) config.channelId = values.channelId;
            if ('message' in values) config.message = values.message;
            if ('embedEnabled' in values) config.embed.enabled = values.embedEnabled;
            for (const key of embedKeys) if (key in values) config.embed[key] = values[key];
        }),
    });
}

memberMessageSection('welcome', 'Welcome messages', 'Sent when someone joins. Placeholders: {user} {username} {displayname} {server} {membercount} {membercount_ordinal}.');
memberMessageSection('goodbye', 'Goodbye messages', 'Sent when someone leaves. Same placeholders as welcome messages.');
memberMessageSection('boost', 'Boost messages', 'Sent when someone boosts. Same placeholders as welcome messages, plus {boostcount} and {boostlevel}.');

defineSection({
    id: 'bumpReminders',
    label: 'Bump reminders',
    description: 'Remind the server to bump on DISBOARD and other listing bots.',
    fields: [
        { key: 'enabled', type: 'boolean', label: 'Enabled', default: false },
        { key: 'channelId', type: 'channel', label: 'Reminder channel (empty = where the bump happened)', default: null },
        { key: 'roleId', type: 'role', label: 'Role to ping', default: null },
        { key: 'message', type: 'string', label: 'Reminder text ({bot} and {command} are filled in)', default: null, maxLength: 500 },
    ],
    load: (guildId) => bumpStore.get(guildId),
    save: (guildId, values) => bumpStore.update(guildId, (data) => {
        Object.assign(data, values);
        if (values.enabled === false) data.pending = {};
    }),
});

defineSection({
    id: 'confessions',
    label: 'Confessions',
    description: 'Anonymous confessions posted with /confess.',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Confession channel (empty = off)', default: null },
    ],
    load: (guildId) => confessionStore.get(guildId),
    save: (guildId, values) => confessionStore.update(guildId, (data) => { Object.assign(data, values); }),
});

defineSection({
    id: 'streaks',
    label: 'Message streaks',
    description: 'Members keep a streak by sending a message every day. Streaks are announced in a channel.',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Announcement channel (empty = off)', default: null },
        { key: 'minDays', type: 'number', label: 'Announce from this many days', default: 2, min: 1, max: 365, integer: true },
    ],
    load: (guildId) => streakStore.get(guildId),
    save: (guildId, values) => streakStore.update(guildId, (data) => { Object.assign(data, values); }),
});

defineSection({
    id: 'colorRoles',
    label: 'Color roles',
    description: 'The reaction panel members use to pick a name color. Add and remove colors with /colorrole.',
    permission: 'ManageRoles',
    fields: [
        {
            key: 'channelId', type: 'channel', label: 'Panel channel (empty = remove the panel)', default: null,
            botNeeds: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory],
        },
    ],
    load: async (guildId) => {
        const config = await colorRoles.store.get(guildId);
        return { channelId: config.channelId };
    },
    save: async (guildId, values, { guild }) => {
        if (!('channelId' in values) || !guild) return;
        if (values.channelId === null) await colorRoles.disablePanel(guild);
        else await colorRoles.syncPanel(guild, { channel: guild.channels.cache.get(values.channelId) });
    },
});

defineSection({
    id: 'boostPerks',
    label: 'Booster perks',
    description: 'Roles boosters get while they boost. Booster-only channels are set up with /boostperks channel.',
    fields: [
        { key: 'roles', type: 'roles', label: 'Perk roles', default: [], maxItems: 10, assignable: true },
    ],
    load: async (guildId) => {
        const perks = await perkStore.get(guildId);
        return { roles: perks.roles };
    },
    save: async (guildId, values, { guild }) => {
        if (!('roles' in values)) return;
        const before = (await perkStore.get(guildId)).roles;
        const added = values.roles.filter((id) => !before.includes(id));
        const removed = before.filter((id) => !values.roles.includes(id));
        await perkStore.update(guildId, (data) => { data.roles = values.roles; });
        if (!guild || (!added.length && !removed.length)) return;

        if (added.length) {
            const members = await guild.members.fetch();
            for (const member of members.values()) {
                if (member.premiumSinceTimestamp && !member.user.bot) await grantPerks(member).catch(() => {});
            }
        }
        if (removed.length) {
            const { granted } = await perkStore.get(guildId);
            for (const [userId, roleIds] of Object.entries(granted)) {
                if (roleIds.some((id) => removed.includes(id))) await revokePerks(guild, userId, removed).catch(() => {});
            }
        }
    },
});

module.exports = registry;
