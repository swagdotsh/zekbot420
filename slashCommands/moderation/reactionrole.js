const {
    ChannelType,
    EmbedBuilder,
    InteractionContextType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const rr = require('../../reactionRoles');
const { ok, fail } = require('../../ui');

const reply = (interaction, content) => interaction.editReply({ content, allowedMentions: { parse: [] } });
const linkTo = (guildId, entry, messageId) => `https://discord.com/channels/${guildId}/${entry.channelId}/${messageId}`;

async function runPost(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const perms = channel.permissionsFor(interaction.guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions])) {
        return reply(interaction, fail(`I need the \`View Channel\`, \`Send Messages\`, \`Embed Links\` and \`Add Reactions\` permissions in ${channel}.`));
    }

    const entry = {
        channelId: channel.id,
        unique: interaction.options.getBoolean('unique') ?? false,
        panel: {
            title: interaction.options.getString('title', true),
            description: interaction.options.getString('description')?.replace(/\\n/g, '\n') ?? null,
        },
        roles: {},
    };
    const message = await channel.send({ embeds: [rr.panelEmbed(entry, interaction.guild)] });
    await rr.store.update(interaction.guild.id, (data) => { data.messages[message.id] = entry; });

    return reply(interaction, ok(`Posted the panel in ${channel}: ${message.url}`)
        + `\n-# Add roles to it with \`/reactionrole add message:${message.id}\`, run in ${channel}, or paste the link.`);
}

async function runAdd(interaction) {
    const { message, error } = await rr.resolveMessage(interaction, interaction.options.getString('message', true));
    if (error) return reply(interaction, fail(error));

    const parsed = rr.parseEmoji(interaction.options.getString('emoji', true));
    if (!parsed) return reply(interaction, fail('The emoji has to be a single emoji, like 🎮 or a custom server emoji.'));

    const role = interaction.options.getRole('role', true);
    const problem = rr.reactionRoleBlocker(interaction.member, role);
    if (problem) return reply(interaction, fail(problem));

    const config = await rr.store.get(interaction.guild.id);
    const existing = config.messages[message.id];
    if (existing?.roles[parsed.key]) return reply(interaction, fail(`${parsed.emoji} already gives <@&${existing.roles[parsed.key].roleId}> on that message.`));
    if (Object.keys(existing?.roles ?? {}).length >= rr.MAX_PER_MESSAGE) return reply(interaction, fail(`A message can have up to ${rr.MAX_PER_MESSAGE} reaction roles.`));

    try {
        await message.react(parsed.emoji);
    } catch {
        return reply(interaction, fail('I couldn\'t react with that emoji. Custom emoji have to be from a server I\'m in.'));
    }

    const unique = interaction.options.getBoolean('unique');
    let entry;
    await rr.store.update(interaction.guild.id, (data) => {
        entry = data.messages[message.id] ??= { channelId: message.channelId, unique: false, panel: null, roles: {} };
        if (unique !== null) entry.unique = unique;
        entry.roles[parsed.key] = { roleId: role.id, emoji: parsed.emoji };
    });
    await rr.refreshPanel(interaction.guild, message.id, entry);

    return reply(interaction, ok(`Reacting with ${parsed.emoji} on ${message.url} now gives ${role}.`)
        + (entry.unique ? '\n-# Members can only have one role from this message at a time.' : ''));
}

async function runRemove(interaction) {
    const { message, error } = await rr.resolveMessage(interaction, interaction.options.getString('message', true));
    if (error) return reply(interaction, fail(error));
    const parsed = rr.parseEmoji(interaction.options.getString('emoji', true));
    if (!parsed) return reply(interaction, fail('That isn\'t an emoji.'));

    let removed = null;
    let entry;
    await rr.store.update(interaction.guild.id, (data) => {
        entry = data.messages[message.id];
        removed = entry?.roles[parsed.key] ?? null;
        if (removed) delete entry.roles[parsed.key];
        if (entry && !entry.panel && !Object.keys(entry.roles).length) delete data.messages[message.id];
    });
    if (!removed) return reply(interaction, fail(`${parsed.emoji} isn't a reaction role on that message.`));

    const reaction = message.reactions.cache.find((r) => rr.emojiKey(r.emoji) === parsed.key);
    await reaction?.users.remove(interaction.client.user.id).catch(() => {});
    await rr.refreshPanel(interaction.guild, message.id, entry);
    return reply(interaction, ok(`${parsed.emoji} no longer gives <@&${removed.roleId}> on that message.`));
}

async function runClear(interaction) {
    const { message, error } = await rr.resolveMessage(interaction, interaction.options.getString('message', true));
    if (error) return reply(interaction, fail(error));

    let entry = null;
    await rr.store.update(interaction.guild.id, (data) => {
        entry = data.messages[message.id] ?? null;
        delete data.messages[message.id];
    });
    if (!entry) return reply(interaction, fail('That message has no reaction roles.'));

    for (const reaction of message.reactions.cache.values()) {
        if (entry.roles[rr.emojiKey(reaction.emoji)]) await reaction.users.remove(interaction.client.user.id).catch(() => {});
    }
    if (entry.panel && message.deletable) await message.delete().catch(() => {});
    return reply(interaction, ok(entry.panel ? 'Deleted the reaction role panel.' : 'Removed every reaction role from that message.'));
}

async function runList(interaction) {
    const config = await rr.store.get(interaction.guild.id);
    const entries = Object.entries(config.messages);
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Reaction roles')
        .setDescription(entries.length ? null : '*None yet. Post a panel with `/reactionrole post` or add one to any message with `/reactionrole add`.*');

    for (const [messageId, entry] of entries.slice(0, 25)) {
        const roles = Object.values(entry.roles).map((r) => `${r.emoji} <@&${r.roleId}>`).join(' - ') || '*no roles yet*';
        embed.addFields({
            name: `${entry.panel ? entry.panel.title : 'Message'} in #${interaction.guild.channels.cache.get(entry.channelId)?.name ?? 'deleted-channel'}${entry.unique ? ' (one at a time)' : ''}`.slice(0, 256),
            value: `${roles}\n[Jump to message](${linkTo(interaction.guild.id, entry, messageId)})`.slice(0, 1024),
        });
    }
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}

const messageOption = (opt) => opt.setName('message').setDescription('Message link, or a message ID from this channel').setRequired(true).setMaxLength(200);
const emojiOption = (opt) => opt.setName('emoji').setDescription('The emoji to react with').setRequired(true).setMaxLength(64);

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Let members get roles by reacting to a message')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand((sub) => sub.setName('post').setDescription('Post a reaction role panel that lists its roles')
            .addStringOption((opt) => opt.setName('title').setDescription('Panel title, like "Pick your pronouns"').setRequired(true).setMaxLength(256))
            .addStringOption((opt) => opt.setName('description').setDescription('Text above the roles (use \\n for a new line)').setMaxLength(2000))
            .addChannelOption((opt) => opt.setName('channel').setDescription('Where to post it (default: here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addBooleanOption((opt) => opt.setName('unique').setDescription('Members can only have one role from this panel (default: no)')))
        .addSubcommand((sub) => sub.setName('add').setDescription('Give a role when someone reacts to a message with an emoji')
            .addStringOption(messageOption)
            .addStringOption(emojiOption)
            .addRoleOption((opt) => opt.setName('role').setDescription('The role to give').setRequired(true))
            .addBooleanOption((opt) => opt.setName('unique').setDescription('Members can only have one role from this message')))
        .addSubcommand((sub) => sub.setName('remove').setDescription('Remove one reaction role from a message')
            .addStringOption(messageOption)
            .addStringOption(emojiOption))
        .addSubcommand((sub) => sub.setName('clear').setDescription('Remove every reaction role from a message (deletes bot panels)')
            .addStringOption(messageOption))
        .addSubcommand((sub) => sub.setName('list').setDescription('Show every reaction role in this server')),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: fail('You need the `Manage Roles` permission to use this.'), flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral, loadingText: 'Setting up reaction roles...' });
        switch (interaction.options.getSubcommand()) {
            case 'post': return runPost(interaction);
            case 'add': return runAdd(interaction);
            case 'remove': return runRemove(interaction);
            case 'clear': return runClear(interaction);
            default: return runList(interaction);
        }
    },
};
