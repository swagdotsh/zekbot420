const { EventEmitter } = require('events');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const sections = new Map();
const events = new EventEmitter();
let botClient = null;

const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const DANGEROUS_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.MentionEveryone,
];

function setClient(client) {
    botClient = client;
}

class SettingsError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'SettingsError';
        this.field = field;
    }
}

function defineSection(section) {
    if (sections.has(section.id)) throw new Error(`Settings section "${section.id}" is defined twice.`);
    sections.set(section.id, { permission: 'ManageGuild', ...section });
    return section;
}

const SNOWFLAKE = /^\d{17,20}$/;

function validateField(field, value) {
    if (value === null || value === undefined || value === '') {
        if (field.required) throw new SettingsError(`${field.label} is required.`, field.key);
        return field.type === 'boolean' ? Boolean(field.default) : null;
    }

    switch (field.type) {
        case 'boolean':
            if (typeof value !== 'boolean') throw new SettingsError(`${field.label} must be on or off.`, field.key);
            return value;
        case 'number': {
            const n = Number(value);
            if (!Number.isFinite(n)) throw new SettingsError(`${field.label} must be a number.`, field.key);
            if (field.min !== undefined && n < field.min) throw new SettingsError(`${field.label} must be at least ${field.min}.`, field.key);
            if (field.max !== undefined && n > field.max) throw new SettingsError(`${field.label} must be at most ${field.max}.`, field.key);
            return field.integer ? Math.round(n) : n;
        }
        case 'color':
            if (!/^#?[0-9a-f]{6}$/i.test(String(value))) throw new SettingsError(`${field.label} must be a hex color like #00ff88.`, field.key);
            return `#${String(value).replace('#', '').toLowerCase()}`;
        case 'channel':
        case 'role':
            if (!SNOWFLAKE.test(String(value))) throw new SettingsError(`${field.label} must be a ${field.type}.`, field.key);
            return String(value);
        case 'channels':
        case 'roles': {
            if (!Array.isArray(value)) throw new SettingsError(`${field.label} must be a list.`, field.key);
            const ids = [...new Set(value.map(String))];
            if (ids.some((id) => !SNOWFLAKE.test(id))) throw new SettingsError(`${field.label} has something that isn't a ${field.type.slice(0, -1)}.`, field.key);
            if (field.maxItems && ids.length > field.maxItems) throw new SettingsError(`${field.label} can have at most ${field.maxItems}.`, field.key);
            return ids;
        }
        case 'enum':
            if (!field.options.some((o) => o.value === value)) throw new SettingsError(`${field.label} isn't a valid choice.`, field.key);
            return value;
        case 'url': {
            let url;
            try { url = new URL(String(value)); } catch { throw new SettingsError(`${field.label} must be a link.`, field.key); }
            if (!['http:', 'https:'].includes(url.protocol)) throw new SettingsError(`${field.label} must be an http(s) link.`, field.key);
            return url.href;
        }
        case 'string':
        case 'text': {
            const text = String(value);
            const trimmed = field.type === 'string' ? text.trim() : text;
            if (field.minLength && trimmed.length < field.minLength) throw new SettingsError(`${field.label} must be at least ${field.minLength} characters.`, field.key);
            if (field.maxLength && trimmed.length > field.maxLength) throw new SettingsError(`${field.label} can be at most ${field.maxLength} characters.`, field.key);
            if (field.pattern && !field.pattern.test(trimmed)) throw new SettingsError(field.patternMessage ?? `${field.label} isn't valid.`, field.key);
            return trimmed;
        }
        default:
            throw new Error(`Unknown setting type "${field.type}" for ${field.key}`);
    }
}

function getSection(id) {
    const section = sections.get(id);
    if (!section) throw new SettingsError(`There's no settings section "${id}".`);
    return section;
}

function describe() {
    return [...sections.values()].map(({ id, label, description, permission, fields }) => ({
        id,
        label,
        description: description ?? null,
        permission,
        fields: fields.map(({ validate, pattern, botNeeds, ...field }) => ({ ...field, pattern: pattern ? pattern.source : undefined })),
    }));
}

async function getSectionValues(guildId, id) {
    const section = getSection(id);
    const stored = await section.load(guildId);
    return Object.fromEntries(section.fields.map((f) => [f.key, stored[f.key] ?? f.default ?? null]));
}

async function getAllValues(guildId) {
    const out = {};
    for (const id of sections.keys()) out[id] = await getSectionValues(guildId, id);
    return out;
}

function checkInGuild(guild, field, value) {
    if (!guild || value === null) return;
    const me = guild.members.me;
    const list = Array.isArray(value) ? value : [value];

    if (field.type === 'channel' || field.type === 'channels') {
        const types = field.channelTypes ?? TEXT_CHANNEL_TYPES;
        for (const id of list) {
            const channel = guild.channels.cache.get(id);
            if (!channel) throw new SettingsError(`${field.label}: that channel isn't in this server.`, field.key);
            if (!types.includes(channel.type)) throw new SettingsError(`${field.label}: #${channel.name} isn't the right kind of channel.`, field.key);
            const needs = field.botNeeds ?? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
            if (!channel.permissionsFor(me)?.has(needs)) {
                throw new SettingsError(`${field.label}: I don't have the permissions I need in #${channel.name}.`, field.key);
            }
        }
    }

    if (field.type === 'role' || field.type === 'roles') {
        for (const id of list) {
            const role = guild.roles.cache.get(id);
            if (!role || role.id === guild.roles.everyone.id) throw new SettingsError(`${field.label}: that role isn't in this server.`, field.key);
            if (!field.assignable) continue;
            if (role.managed) throw new SettingsError(`${field.label}: @${role.name} is managed by Discord or an integration.`, field.key);
            if (role.position >= me.roles.highest.position) throw new SettingsError(`${field.label}: @${role.name} is above my highest role.`, field.key);
            if (DANGEROUS_PERMISSIONS.some((perm) => role.permissions.has(perm))) {
                throw new SettingsError(`${field.label}: @${role.name} has moderator permissions, so I won't hand it out.`, field.key);
            }
        }
    }
}

async function updateSection(guildId, id, patch, actor = {}) {
    const section = getSection(id);
    const guild = botClient?.guilds.cache.get(guildId) ?? null;
    const context = { guildId, guild, client: botClient, actor };
    const clean = {};
    for (const [key, value] of Object.entries(patch)) {
        const field = section.fields.find((f) => f.key === key);
        if (!field) throw new SettingsError(`Unknown setting "${key}".`, key);
        if (field.readOnly) throw new SettingsError(`${field.label} can't be changed here.`, key);
        clean[key] = validateField(field, value);
        checkInGuild(guild, field, clean[key]);
        if (field.validate) {
            const problem = await field.validate(clean[key], context);
            if (problem) throw new SettingsError(problem, key);
        }
    }

    const before = await getSectionValues(guildId, id);
    await section.save(guildId, clean, context);
    const after = await getSectionValues(guildId, id);
    events.emit('change', { guildId, section: id, before, after, actor });
    return after;
}

function onChange(listener) {
    events.on('change', listener);
    return () => events.off('change', listener);
}

function canAccess(member, sectionOrId) {
    const section = typeof sectionOrId === 'string' ? getSection(sectionOrId) : sectionOrId;
    if (!member) return false;
    if (member.id === member.guild.ownerId) return true;
    return member.permissions.has(PermissionFlagsBits[section.permission] ?? PermissionFlagsBits.ManageGuild);
}

function sectionIds() {
    return [...sections.keys()];
}

module.exports = {
    SettingsError,
    setClient,
    canAccess,
    sectionIds,
    defineSection,
    describe,
    getSectionValues,
    getAllValues,
    updateSection,
    onChange,
    validateField,
};
