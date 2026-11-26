const { ApplicationCommandOptionType, MessageFlags, PermissionsBitField } = require('discord.js');
const { fail } = require('./ui');

const SUBCOMMAND = ApplicationCommandOptionType.Subcommand;
const GROUP = ApplicationCommandOptionType.SubcommandGroup;

function childJson(child) {
    if (child.module) return child.module.data.toJSON();
    return { options: [], default_member_permissions: null, ...child.json };
}

function permissionNames(bits) {
    const names = new PermissionsBitField(bits).toArray()
        .map(name => name.replace('Guild', 'Server').replace(/([a-z])([A-Z])/g, '$1 $2'))
        .map(name => `\`${name}\``);
    return `${names.join(' and ')} permission${names.length === 1 ? '' : 's'}`;
}

const CONTEXT_NAMES = { 0: 'servers', 1: 'DMs with the bot', 2: 'group DMs and DMs with others' };

function defineGroup({ name, description, children, defaultMemberPermissions, contexts, integrationTypes }) {
    const entries = new Map();
    const options = [];
    let shared = null;
    const contextUnion = new Set();
    const integrationUnion = new Set();

    for (const child of children) {
        let json = childJson(child);
        if (child.flatten) {
            const [only] = json.options ?? [];
            json = { ...json, description: only.description, options: only.options ?? [] };
        }
        const childOptions = json.options ?? [];
        const childContexts = json.contexts ?? null;
        const childIntegrations = json.integration_types ?? null;
        (childContexts ?? [0]).forEach((c) => contextUnion.add(c));
        (childIntegrations ?? [0]).forEach((t) => integrationUnion.add(t));
        const isGroup = childOptions.some(option => option.type === SUBCOMMAND);
        const perms = json.default_member_permissions != null ? BigInt(json.default_member_permissions) : 0n;

        shared = shared === null ? perms : (shared & perms);
        options.push({
            type: isGroup ? GROUP : SUBCOMMAND,
            name: child.name,
            description: child.description ?? json.description,
            options: childOptions,
        });

        entries.set(child.name, {
            execute: child.execute ?? child.module.execute.bind(child.module),
            autocomplete: child.autocomplete ?? child.module?.autocomplete?.bind(child.module),
            cooldown: child.cooldown ?? child.module?.cooldown,
            perms,
            contexts: childContexts,
            integrations: childIntegrations,
        });
        for (const absorbed of [child.module, ...(child.absorbs ?? [])]) if (absorbed) absorbed.grouped = true;
    }

    const json = {
        name,
        description,
        type: 1,
        options,
        contexts: contexts ?? [...contextUnion].sort(),
        integration_types: integrationTypes ?? [...integrationUnion].sort(),
        default_member_permissions: defaultMemberPermissions != null
            ? BigInt(defaultMemberPermissions).toString()
            : (shared ? shared.toString() : null),
    };

    const entryFor = (interaction) =>
        entries.get(interaction.options.getSubcommandGroup(false) ?? interaction.options.getSubcommand(false));

    return {
        data: { name, toJSON: () => json },
        children: entries,

        getCooldown(interaction) {
            return entryFor(interaction)?.cooldown;
        },

        async autocomplete(interaction) {
            await entryFor(interaction)?.autocomplete?.(interaction);
        },

        async execute(interaction) {
            const entry = entryFor(interaction);
            if (!entry) return;

            if (entry.contexts && interaction.context != null && !entry.contexts.includes(interaction.context)) {
                const where = entry.contexts.map((c) => CONTEXT_NAMES[c]).filter(Boolean).join(' and ');
                return interaction.reply({ content: fail(`That only works in ${where}.`), flags: MessageFlags.Ephemeral });
            }
            const guildInstalled = interaction.authorizingIntegrationOwners?.['0'] !== undefined;
            if (!(entry.integrations ?? [0]).includes(1) && interaction.inGuild() && !guildInstalled) {
                return interaction.reply({ content: fail('That only works in servers I\'ve been added to.'), flags: MessageFlags.Ephemeral });
            }

            if (entry.perms && !interaction.memberPermissions?.has(entry.perms)) {
                return interaction.reply({
                    content: fail(`You need the ${permissionNames(entry.perms)} to use this.`),
                    flags: MessageFlags.Ephemeral,
                });
            }

            return entry.execute(interaction);
        },
    };
}

module.exports = { defineGroup };
