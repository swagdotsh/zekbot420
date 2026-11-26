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

function defineGroup({ name, description, children, defaultMemberPermissions, contexts = [0], integrationTypes = [0] }) {
    const entries = new Map();
    const options = [];
    let shared = null;

    for (const child of children) {
        const json = childJson(child);
        const childOptions = json.options ?? [];
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
        });
        for (const absorbed of [child.module, ...(child.absorbs ?? [])]) if (absorbed) absorbed.grouped = true;
    }

    const json = {
        name,
        description,
        type: 1,
        options,
        contexts,
        integration_types: integrationTypes,
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
