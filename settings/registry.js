const { EventEmitter } = require('events');

const sections = new Map();
const events = new EventEmitter();

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
        fields: fields.map(({ validate, pattern, ...field }) => ({ ...field, pattern: pattern ? pattern.source : undefined })),
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

async function updateSection(guildId, id, patch, actor = {}) {
    const section = getSection(id);
    const clean = {};
    for (const [key, value] of Object.entries(patch)) {
        const field = section.fields.find((f) => f.key === key);
        if (!field) throw new SettingsError(`Unknown setting "${key}".`, key);
        clean[key] = validateField(field, value);
        if (field.validate) {
            const problem = await field.validate(clean[key], { guildId });
            if (problem) throw new SettingsError(problem, key);
        }
    }

    const before = await getSectionValues(guildId, id);
    await section.save(guildId, clean);
    const after = await getSectionValues(guildId, id);
    events.emit('change', { guildId, section: id, before, after, actor });
    return after;
}

function onChange(listener) {
    events.on('change', listener);
    return () => events.off('change', listener);
}

module.exports = {
    SettingsError,
    defineSection,
    describe,
    getSectionValues,
    getAllValues,
    updateSection,
    onChange,
    validateField,
};
