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
const path = require('path');
const { readJson, updateJson } = require('../jsonStore');
const { DATA_DIR } = require('../paths');
const trap = require('../events/trapHelper');
const leveling = require('../leveling');
const starboard = require('../starboardHandler');
const tickets = require('../ticketHandler');
const tts = require('../ttsHandler');
const sticky = require('../stickyrolesDbHndlr');
const sports = require('../nflHandler');
const { getJailConfig } = require('../jailHandler');
const downloads = require('../downloads');
const { ChannelType } = require('discord.js');

const guildFile = (guildId, name) => path.join(DATA_DIR, String(guildId), name);
const LOG_CHANNEL_NEEDS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

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
    description: 'Reply to X, Instagram and TikTok links with the post text, photos and videos. By default only links sent as "zekbot <link>" (or zekbot420, zkb, zk, 420 or a ping) are embedded.',
    fields: [
        { key: 'enabled', type: 'boolean', label: 'Enabled', default: false },
        {
            key: 'trigger', type: 'enum', label: 'When to embed', default: 'mention',
            options: [
                { value: 'mention', label: 'Only when someone calls the bot, like "zekbot <link>"' },
                { value: 'auto', label: 'Every X, Instagram and TikTok link' },
            ],
        },
        { key: 'x', type: 'boolean', label: 'X / Twitter links', default: true },
        { key: 'instagram', type: 'boolean', label: 'Instagram links', default: true },
        { key: 'tiktok', type: 'boolean', label: 'TikTok links', default: true },
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

defineSection({
    id: 'downloads',
    label: 'Video downloads',
    description: `Lets members download videos (up to ${downloads.MAX_DURATION / 60} minutes) from YouTube, TikTok, X and most other sites with /download. Off by default.`,
    fields: [
        { key: 'enabled', type: 'boolean', label: 'Enabled', default: false },
    ],
    load: (guildId) => downloads.store.get(guildId),
    save: (guildId, values) => downloads.store.update(guildId, (data) => { Object.assign(data, values); }),
});

defineSection({
    id: 'modlog',
    label: 'Mod log',
    description: 'Where moderation actions, deleted and edited messages, and AutoMod alerts are logged.',
    permission: 'Administrator',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Mod log channel (empty = off)', default: null, botNeeds: LOG_CHANNEL_NEEDS },
    ],
    load: async (guildId) => ({ channelId: (await trap.readGuildConfig(guildId)).channelId }),
    save: (guildId, values) => trap.writeGuildConfig(guildId, values),
});

defineSection({
    id: 'trap',
    label: 'Trap channel',
    description: 'A honeypot channel: anyone who posts in it is banned, unless they have an exempt role. Create it with the setuptrap command.',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Trap channel', default: null, readOnly: true },
        { key: 'exemptRoles', type: 'roles', label: 'Roles that can post without being banned', default: [], maxItems: 25 },
        { key: 'banCount', type: 'number', label: 'People banned by the trap', default: 0, readOnly: true },
    ],
    load: async (guildId) => {
        const config = await trap.readGuildConfig(guildId);
        return { channelId: config.trapChannelId, exemptRoles: config.trapExemptRoleIds, banCount: config.trapBanCount };
    },
    save: (guildId, values) => trap.writeGuildConfig(guildId, { trapExemptRoleIds: values.exemptRoles }),
});

defineSection({
    id: 'leveling',
    label: 'Leveling',
    description: 'Members earn XP for chatting and being in voice, level up, and get roles at set levels. Turning it off keeps everyone\'s XP.',
    fields: [
        { key: 'enabled', type: 'boolean', label: 'Enabled', default: false },
        { key: 'channelId', type: 'channel', label: 'Level-up announcement channel (empty = where they leveled up)', default: null, botNeeds: LOG_CHANNEL_NEEDS },
        { key: 'xpMin', type: 'number', label: 'Least XP per message', default: 10, min: 1, max: 1000, integer: true },
        { key: 'xpMax', type: 'number', label: 'Most XP per message', default: 30, min: 1, max: 1000, integer: true },
        { key: 'leaderboard', type: 'boolean', label: 'Leaderboard', default: true },
        {
            key: 'roles', type: 'list', label: 'Level roles', default: [], maxItems: 50, uniqueBy: 'level',
            fields: [
                { key: 'level', type: 'number', label: 'Level', required: true, min: 1, max: 1000, integer: true },
                { key: 'roleId', type: 'role', label: 'Role', required: true, assignable: true },
            ],
        },
    ],
    validate: (values) => (values.xpMin > values.xpMax ? { message: 'Least XP per message can\'t be more than the most.', field: 'xpMin' } : null),
    load: async (guildId) => {
        const [config, roles] = await Promise.all([leveling.getConfig(guildId), leveling.getLevelRoles(guildId)]);
        return {
            enabled: Boolean(config),
            channelId: config?.level_channel ?? null,
            xpMin: config?.xp_min,
            xpMax: config?.xp_max,
            leaderboard: config?.lb_enabled,
            roles: roles.map((row) => ({ level: row.level, roleId: row.role_id })),
        };
    },
    save: async (guildId, values) => {
        const current = await registry.getSectionValues(guildId, 'leveling');
        const next = { ...current, ...values };
        const configKeys = ['enabled', 'channelId', 'xpMin', 'xpMax', 'leaderboard'];
        if (configKeys.some((key) => key in values)) {
            if (next.enabled) {
                await leveling.setConfig(guildId, { levelChannel: next.channelId, xpMin: next.xpMin, xpMax: next.xpMax, lbEnabled: next.leaderboard });
            } else if (current.enabled) {
                await leveling.disableLeveling(guildId);
            }
        }
        if ('roles' in values) await leveling.replaceLevelRoles(guildId, values.roles);
    },
});

defineSection({
    id: 'starboard',
    label: 'Starboard',
    description: 'Messages that get enough reactions are reposted to the starboard channel.',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Starboard channel (empty = off)', default: null, botNeeds: LOG_CHANNEL_NEEDS },
        { key: 'threshold', type: 'number', label: 'Reactions needed', default: 3, min: 1, max: 1000, integer: true },
        { key: 'allowSelf', type: 'boolean', label: 'Count people starring their own message', default: false },
        {
            key: 'emoji', type: 'string', label: 'Reaction emoji (an emoji, or a custom one like <:name:id>)', default: '⭐', required: true, maxLength: 100,
            validate: (value) => (starboard.parseReactionEmoji(value) ? null : 'That isn\'t an emoji.'),
        },
    ],
    load: async (guildId) => {
        const config = await starboard.readConfig(guildId);
        const { id, name } = config.reactionEmoji;
        return { channelId: config.channelId, threshold: config.threshold, allowSelf: config.allowSelf, emoji: id ? `<:${name}:${id}>` : name };
    },
    save: (guildId, values) => starboard.updateConfig(guildId, (config) => {
        if ('channelId' in values) config.channelId = values.channelId;
        if ('threshold' in values) config.threshold = values.threshold;
        if ('allowSelf' in values) config.allowSelf = values.allowSelf;
        if ('emoji' in values) config.reactionEmoji = starboard.parseReactionEmoji(values.emoji);
    }),
});

const BIRTHDAY_FILE = path.join(DATA_DIR, 'birthdayConfig.json');
defineSection({
    id: 'birthdays',
    label: 'Birthdays',
    description: 'Members set their birthday with /birthday set. On the day they get the birthday role and an announcement.',
    permission: 'ManageRoles',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Announcement channel (empty = off)', default: null },
        { key: 'roleId', type: 'role', label: 'Birthday role', default: null, assignable: true },
    ],
    load: async (guildId) => (await readJson(BIRTHDAY_FILE, {}))[guildId] ?? {},
    save: (guildId, values) => updateJson(BIRTHDAY_FILE, {}, (all) => {
        all[guildId] = { ...(all[guildId] ?? {}), ...values, updatedAt: new Date().toISOString() };
        return all;
    }),
});

defineSection({
    id: 'tickets',
    label: 'Tickets',
    description: 'Private support tickets. Set them up with /ticket setup first, which makes the category and log channel.',
    fields: [
        { key: 'setUp', type: 'boolean', label: 'Set up', default: false, readOnly: true },
        { key: 'categoryId', type: 'channel', label: 'Ticket category', default: null, readOnly: true },
        { key: 'supportRoles', type: 'roles', label: 'Support roles (can see and handle tickets)', default: [], maxItems: 10 },
        {
            key: 'logChannelId', type: 'channel', label: 'Transcript log channel', default: null, required: true,
            botNeeds: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
        },
        { key: 'maxOpenPerUser', type: 'number', label: 'Open tickets each member can have', default: 1, min: 1, max: 10, integer: true },
    ],
    validate: (values) => {
        if (!values.setUp) return 'Set up tickets with /ticket setup first.';
        if (!values.supportRoles.length) return { message: 'Tickets need at least one support role.', field: 'supportRoles' };
        return null;
    },
    load: async (guildId) => {
        const config = await tickets.getTicketConfig(guildId);
        if (!config) return {};
        return {
            setUp: true,
            categoryId: config.category_id,
            supportRoles: config.supportRoleIds,
            logChannelId: config.log_channel_id,
            maxOpenPerUser: config.max_open_per_user,
        };
    },
    save: async (guildId, values, { guild }) => {
        if (!guild) return;
        await tickets.updateTicketSettings(guild, {
            supportRoleIds: values.supportRoles,
            logChannelId: values.logChannelId,
            maxOpenPerUser: values.maxOpenPerUser,
        });
    },
});

defineSection({
    id: 'tts',
    label: 'Text to speech',
    description: 'While the bot is in voice with /tts, messages in the voice channel\'s chat are read out. You can add one more text channel to read from.',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Extra channel to read out (empty = only the voice chat)', default: null },
    ],
    load: (guildId) => tts.getTtsConfig(guildId),
    save: (guildId, values) => tts.setTtsChannel(guildId, values.channelId),
});

defineSection({
    id: 'stickyRoles',
    label: 'Sticky roles',
    description: 'Members who leave and come back get these roles back.',
    permission: 'ManageRoles',
    fields: [
        { key: 'enabled', type: 'boolean', label: 'Enabled', default: false },
        { key: 'roles', type: 'roles', label: 'Sticky roles', default: [], maxItems: 25, assignable: true },
    ],
    load: async (guildId) => {
        const [enabled, roles] = await Promise.all([sticky.getStickyRolesEnabled(guildId), sticky.getStickyRoles(guildId)]);
        return { enabled, roles: roles.map((row) => row.role_id) };
    },
    save: async (guildId, values) => {
        if ('enabled' in values) await sticky.setStickyRolesEnabled(guildId, values.enabled);
        if ('roles' in values) {
            const before = (await sticky.getStickyRoles(guildId)).map((row) => row.role_id);
            for (const id of before.filter((r) => !values.roles.includes(r))) await sticky.removeStickyRole(guildId, id);
            for (const id of values.roles.filter((r) => !before.includes(r))) await sticky.addStickyRole(guildId, id);
        }
    },
});

defineSection({
    id: 'sportsAlerts',
    label: 'Sports alerts',
    description: 'Where members who made this their home server get pinged about the NFL and NBA players and teams they follow.',
    fields: [
        { key: 'channelId', type: 'channel', label: 'Alert channel (empty = DM them instead)', default: null },
    ],
    load: async (guildId) => ({ channelId: await sports.getNotifyChannel(guildId) }),
    save: (guildId, values) => sports.setNotifyChannel(guildId, values.channelId),
});

defineSection({
    id: 'jail',
    label: 'Jail',
    description: 'Read only. Set up with /setup jail and removed with /disable jail, since that makes a role and a channel.',
    permission: 'ManageRoles',
    fields: [
        { key: 'setUp', type: 'boolean', label: 'Set up', default: false, readOnly: true },
        { key: 'channelId', type: 'channel', label: 'Jail channel', default: null, readOnly: true },
        { key: 'roleId', type: 'role', label: 'Jail role', default: null, readOnly: true },
    ],
    load: async (guildId) => {
        const config = await getJailConfig(guildId);
        return config ? { setUp: true, channelId: config.jail_channel_id, roleId: config.jail_role_id } : {};
    },
    save: async () => {},
});

defineSection({
    id: 'reactionMute',
    label: 'Reaction mute',
    description: 'Read only. Set up with /setup reactionmute, which makes the role that stops people reacting.',
    permission: 'ManageRoles',
    fields: [
        { key: 'setUp', type: 'boolean', label: 'Set up', default: false, readOnly: true },
        { key: 'roleId', type: 'role', label: 'Reaction muted role', default: null, readOnly: true },
    ],
    load: async (guildId) => {
        const config = await readJson(guildFile(guildId, 'reactionmute.json'), null);
        return config?.roleId ? { setUp: true, roleId: config.roleId } : {};
    },
    save: async () => {},
});

defineSection({
    id: 'voicemaster',
    label: 'VoiceMaster',
    description: 'Read only. Set up with /setup voicemaster, which makes the Join to Create channel and its category.',
    permission: 'ManageChannels',
    fields: [
        { key: 'setUp', type: 'boolean', label: 'Set up', default: false, readOnly: true },
        { key: 'joinChannelId', type: 'channel', label: 'Join to Create channel', default: null, readOnly: true, channelTypes: [ChannelType.GuildVoice] },
        { key: 'categoryId', type: 'channel', label: 'Category', default: null, readOnly: true, channelTypes: [ChannelType.GuildCategory] },
    ],
    load: async (guildId) => {
        const config = await readJson(guildFile(guildId, 'voicemaster.json'), null);
        return config?.joinChannelId ? { setUp: true, joinChannelId: config.joinChannelId, categoryId: config.categoryId ?? null } : {};
    },
    save: async () => {},
});

module.exports = registry;
