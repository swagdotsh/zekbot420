const fs = require('fs');
const path = require('path');
const { ApplicationCommandOptionType, ApplicationCommandType, PermissionsBitField } = require('discord.js');
const { loadSlashCommands } = require('./slashLoader');

const OPTION_TYPES = {
    [ApplicationCommandOptionType.String]: 'text',
    [ApplicationCommandOptionType.Integer]: 'whole number',
    [ApplicationCommandOptionType.Number]: 'number',
    [ApplicationCommandOptionType.Boolean]: 'true/false',
    [ApplicationCommandOptionType.User]: 'user',
    [ApplicationCommandOptionType.Channel]: 'channel',
    [ApplicationCommandOptionType.Role]: 'role',
    [ApplicationCommandOptionType.Mentionable]: 'user or role',
    [ApplicationCommandOptionType.Attachment]: 'file',
};

const SUB = ApplicationCommandOptionType.Subcommand;
const GROUP = ApplicationCommandOptionType.SubcommandGroup;

function permissionNames(bits) {
    if (bits == null || bits === '0') return [];
    return new PermissionsBitField(BigInt(bits)).toArray()
        .map((name) => name.replace('Guild', 'Server').replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function where(contexts, integrations) {
    const ctx = contexts ?? [0, 1];
    const anywhere = (integrations ?? [0]).includes(1) && ctx.includes(2);
    if (anywhere) return 'anywhere';
    if (ctx.length === 1 && ctx[0] === 0) return 'servers';
    return 'servers and DMs';
}

function describeOptions(options = []) {
    return options.map((o) => ({
        name: o.name,
        type: OPTION_TYPES[o.type] ?? 'value',
        required: Boolean(o.required),
        description: o.description,
        choices: o.choices?.map((c) => c.name) ?? null,
        autocomplete: Boolean(o.autocomplete),
    }));
}

function flatten(json, children) {
    const base = {
        permissions: permissionNames(json.default_member_permissions),
        where: where(json.contexts, json.integration_types),
    };
    const baseFor = (name) => {
        const child = children?.get(name);
        if (!child) return base;
        return {
            permissions: permissionNames(child.perms ? child.perms.toString() : null),
            where: where(child.contexts ?? json.contexts, child.integrations ?? (child.contexts ? [0] : json.integration_types)),
        };
    };
    const options = json.options ?? [];
    const subs = options.filter((o) => o.type === SUB || o.type === GROUP);
    if (!subs.length) {
        return [{ usage: `/${json.name}`, description: json.description, options: describeOptions(options), ...base }];
    }
    const out = [];
    for (const sub of subs) {
        if (sub.type === SUB) {
            out.push({ usage: `/${json.name} ${sub.name}`, description: sub.description, options: describeOptions(sub.options), ...baseFor(sub.name) });
            continue;
        }
        for (const inner of sub.options ?? []) {
            out.push({ usage: `/${json.name} ${sub.name} ${inner.name}`, description: inner.description, options: describeOptions(inner.options), ...baseFor(sub.name) });
        }
    }
    return out;
}

function slashCatalog() {
    return loadSlashCommands().map((command) => {
        const json = command.data.toJSON();
        const type = json.type ?? ApplicationCommandType.ChatInput;
        if (type !== ApplicationCommandType.ChatInput) {
            return {
                name: json.name,
                kind: type === ApplicationCommandType.Message ? 'message menu' : 'user menu',
                description: `Right-click ${type === ApplicationCommandType.Message ? 'a message' : 'a user'} > Apps > ${json.name}`,
                where: where(json.contexts, json.integration_types),
                commands: [],
            };
        }
        return { name: json.name, kind: 'slash', description: json.description, where: where(json.contexts, json.integration_types), commands: flatten(json, command.children) };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

function prefixCatalog(dir = path.join(__dirname, 'commands')) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...prefixCatalog(full));
            continue;
        }
        if (!entry.name.endsWith('.js') || entry.name.startsWith('_')) continue;
        const command = require(full);
        if (!command?.name || typeof command.execute !== 'function') continue;
        out.push({ name: command.name, aliases: command.aliases ?? [], category: path.basename(path.dirname(full)) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { slashCatalog, prefixCatalog };
