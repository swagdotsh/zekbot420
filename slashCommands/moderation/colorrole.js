const { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const colors = require('../../colorRoles');
const { parseEmoji } = require('../../reactionRoles');
const { ok, fail } = require('../../ui');

const reply = (interaction, content) => interaction.editReply({ content, allowedMentions: { parse: [] } });

async function runAdd(interaction) {
    const guild = interaction.guild;
    const me = guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return reply(interaction, fail('I need the `Manage Roles` permission to create color roles.'));

    const name = interaction.options.getString('name', true).trim();
    const hex = colors.parseColor(interaction.options.getString('color', true));
    if (!hex) return reply(interaction, fail('That isn\'t a color I know. Use a hex code like `#ff66cc` or a name like `pink`.'));

    let emoji = null;
    let key = null;
    const emojiInput = interaction.options.getString('emoji');
    if (emojiInput) {
        const parsed = parseEmoji(emojiInput);
        if (!parsed) return reply(interaction, fail('The emoji has to be a single emoji, like 🍓 or a custom server emoji.'));
        ({ emoji, key } = parsed);
    }

    const config = await colors.store.get(guild.id);
    const needsChannel = !guild.channels.cache.has(config.channelId);
    if (needsChannel && !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return reply(interaction, fail('There\'s no colors channel yet and I need `Manage Channels` to create one. Or pick a channel with `/setup colorroles`.'));
    }

    let added;
    try {
        added = await colors.addColor(guild, { name, hex, emoji, key, actor: interaction.user });
    } catch (error) {
        if (error.code) {
            console.error('[colorrole] failed to create role:', error);
            return reply(interaction, fail('I couldn\'t create the role. Check I have `Manage Roles`.'));
        }
        return reply(interaction, fail(error.message));
    }

    let channel = null;
    try {
        channel = await colors.syncPanel(guild, { createChannel: true });
    } catch (error) {
        return reply(interaction, ok(`Created ${added.role}, but I couldn't update the panel: ${error.message}`));
    }

    const notes = [];
    if (needsChannel) notes.push(`I made ${channel} for the color panel. Members can react there but not chat.`);
    if (!added.positioned) notes.push('I couldn\'t move the role up, so members\' other colored roles may show over it. Drag it higher in Server Settings > Roles.');
    return reply(interaction, ok(`Added ${added.emoji} ${added.role} (\`${hex}\`) to the color panel in ${channel}.`)
        + (notes.length ? `\n-# ${notes.join(' ')}` : ''));
}

async function runRemove(interaction) {
    const role = interaction.options.getRole('role', true);
    const config = await colors.store.get(interaction.guild.id);
    if (!config.colors.some((c) => c.roleId === role.id)) return reply(interaction, fail(`${role} isn't one of the color roles.`));

    const deleteRole = interaction.options.getBoolean('delete_role') ?? true;
    const removed = await colors.removeColor(interaction.guild, role.id, { deleteRole });
    await colors.syncPanel(interaction.guild).catch(() => {});
    return reply(interaction, ok(deleteRole
        ? `Removed **${removed.name}** from the panel and deleted the role.`
        : `Removed ${role} from the panel. The role itself was kept.`));
}

async function runList(interaction) {
    const config = await colors.store.get(interaction.guild.id);
    const lines = config.colors.map((c) => `${c.emoji} <@&${c.roleId}> \`${c.hex}\``);
    const embed = new EmbedBuilder()
        .setColor(config.colors.length ? parseInt(config.colors[0].hex.slice(1), 16) : 0x2b2d31)
        .setTitle(`🎨 Color roles (${config.colors.length}/${colors.MAX_COLORS})`)
        .setDescription(lines.join('\n') || '*No colors yet. Add one with `/colorrole add`.*')
        .addFields({ name: 'Panel', value: config.channelId ? `<#${config.channelId}>` : '*Not set up*' });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function runRefresh(interaction) {
    try {
        const channel = await colors.syncPanel(interaction.guild, { createChannel: true });
        return reply(interaction, ok(`The color panel in ${channel} is up to date.`));
    } catch (error) {
        return reply(interaction, fail(error.message));
    }
}

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('colorrole')
        .setDescription('Name color roles members pick by reacting')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand((sub) => sub.setName('add').setDescription('Create a color role and add it to the color panel')
            .addStringOption((opt) => opt.setName('name').setDescription('Role name, like "Pink"').setRequired(true).setMaxLength(100))
            .addStringOption((opt) => opt.setName('color').setDescription('Hex code like #ff66cc, or a color name like pink').setRequired(true).setMaxLength(20))
            .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji to react with (default: I pick one close to the color)').setMaxLength(64)))
        .addSubcommand((sub) => sub.setName('remove').setDescription('Take a color off the panel')
            .addRoleOption((opt) => opt.setName('role').setDescription('The color role').setRequired(true))
            .addBooleanOption((opt) => opt.setName('delete_role').setDescription('Delete the role too (default: yes)')))
        .addSubcommand((sub) => sub.setName('list').setDescription('Show the color roles'))
        .addSubcommand((sub) => sub.setName('refresh').setDescription('Repost or fix the color panel')),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: fail('You need the `Manage Roles` permission to use this.'), flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral, loadingText: 'Updating the color roles...' });
        switch (interaction.options.getSubcommand()) {
            case 'add': return runAdd(interaction);
            case 'remove': return runRemove(interaction);
            case 'refresh': return runRefresh(interaction);
            default: return runList(interaction);
        }
    },
};
