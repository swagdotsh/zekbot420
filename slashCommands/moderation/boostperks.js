const {
    ChannelType,
    EmbedBuilder,
    InteractionContextType,
    MessageFlags,
    OverwriteType,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { perkStore, grantPerks, revokePerks } = require('../../boosts');
const { reactionRoleBlocker } = require('../../reactionRoles');
const { ok, fail } = require('../../ui');

const MAX_ROLES = 10;
const MAX_CHANNELS = 25;
const PERK_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildStageVoice, ChannelType.GuildCategory];

const reply = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

async function boosters(guild) {
    const members = await guild.members.fetch();
    return members.filter((m) => m.premiumSinceTimestamp && !m.user.bot);
}

async function addRole(interaction) {
    const role = interaction.options.getRole('role', true);
    const problem = reactionRoleBlocker(interaction.member, role);
    if (problem) return reply(interaction, fail(problem.replace('by reacting', 'as a booster perk')));
    if (role.id === interaction.guild.roles.premiumSubscriberRole?.id) return reply(interaction, fail('That\'s Discord\'s own booster role. Discord already gives it out.'));

    const perks = await perkStore.get(interaction.guild.id);
    if (perks.roles.includes(role.id)) return reply(interaction, fail(`${role} is already a booster perk.`));
    if (perks.roles.length >= MAX_ROLES) return reply(interaction, fail(`You can have up to ${MAX_ROLES} perk roles.`));

    await perkStore.update(interaction.guild.id, (data) => { data.roles.push(role.id); });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral, loadingText: 'Giving the role to current boosters...' });

    let given = 0;
    for (const member of (await boosters(interaction.guild)).values()) {
        if ((await grantPerks(member).catch(() => [])).length) given++;
    }
    return interaction.editReply({
        content: ok(`${role} is now a booster perk. Boosters get it when they boost and lose it when their boost ends.`)
            + (given ? `\n-# Gave it to ${given} current booster${given === 1 ? '' : 's'}.` : ''),
        allowedMentions: { parse: [] },
    });
}

async function removeRole(interaction) {
    const role = interaction.options.getRole('role', true);
    const perks = await perkStore.get(interaction.guild.id);
    if (!perks.roles.includes(role.id)) return reply(interaction, fail(`${role} isn't a booster perk.`));

    const takeBack = interaction.options.getBoolean('take_back') ?? true;
    await perkStore.update(interaction.guild.id, (data) => { data.roles = data.roles.filter((id) => id !== role.id); });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral, loadingText: 'Updating boosters\' roles...' });

    let taken = 0;
    for (const [userId, roleIds] of Object.entries(perks.granted)) {
        if (!roleIds.includes(role.id)) continue;
        if (takeBack) await revokePerks(interaction.guild, userId, [role.id]);
        else await perkStore.update(interaction.guild.id, (data) => {
            data.granted[userId] = (data.granted[userId] ?? []).filter((id) => id !== role.id);
            if (!data.granted[userId].length) delete data.granted[userId];
        });
        taken++;
    }
    return interaction.editReply({
        content: ok(`${role} is no longer a booster perk.`)
            + (taken && takeBack ? `\n-# Took it back from ${taken} member${taken === 1 ? '' : 's'} who got it from boosting.` : ''),
        allowedMentions: { parse: [] },
    });
}

async function addChannel(interaction) {
    const guild = interaction.guild;
    const boosterRole = guild.roles.premiumSubscriberRole;
    if (!boosterRole) return reply(interaction, fail('This server doesn\'t have a Server Booster role yet. Discord creates it the first time someone boosts.'));
    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels) || !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return reply(interaction, fail('I need the `Manage Channels` and `Manage Roles` permissions to set up booster channels.'));
    }

    const perks = await perkStore.get(guild.id);
    if (perks.channels.length >= MAX_CHANNELS) return reply(interaction, fail(`You can have up to ${MAX_CHANNELS} booster channels.`));

    let channel = interaction.options.getChannel('channel');
    const name = interaction.options.getString('name');
    if (!channel && !name) return reply(interaction, fail('Pick a `channel` to make booster-only, or give a `name` to create a new one.'));
    if (channel && perks.channels.includes(channel.id)) return reply(interaction, fail(`${channel} is already booster-only.`));

    const overwrites = [
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: boosterRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel] },
    ];

    try {
        if (channel) {
            const reason = 'Booster-only channel';
            await channel.permissionOverwrites.edit(guild.members.me.id, { ViewChannel: true }, { type: OverwriteType.Member, reason });
            await channel.permissionOverwrites.edit(boosterRole.id, { ViewChannel: true }, { type: OverwriteType.Role, reason });
            await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }, { type: OverwriteType.Role, reason });
        } else {
            channel = await guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent: interaction.channel?.parentId ?? undefined,
                permissionOverwrites: overwrites,
                reason: 'Booster-only channel',
            });
        }
    } catch (error) {
        console.error('[boostperks] failed to set up channel:', error);
        return reply(interaction, fail('I couldn\'t change that channel\'s permissions. Check my role is high enough and I can manage the channel.'));
    }

    await perkStore.update(guild.id, (data) => { data.channels.push(channel.id); });
    return reply(interaction, ok(`${channel} is now only visible to boosters (${boosterRole}).`)
        + '\n-# Members with Administrator can still see it. If the channel is in a category, other roles allowed there may need their own overwrite removed.');
}

async function removeChannel(interaction) {
    const channel = interaction.options.getChannel('channel', true);
    const perks = await perkStore.get(interaction.guild.id);
    if (!perks.channels.includes(channel.id)) return reply(interaction, fail(`${channel} isn't a booster channel.`));

    await perkStore.update(interaction.guild.id, (data) => { data.channels = data.channels.filter((id) => id !== channel.id); });
    const reopen = interaction.options.getBoolean('make_public') ?? true;
    if (reopen) {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: null }, { reason: 'No longer a booster channel' }).catch(() => {});
        const boosterRole = interaction.guild.roles.premiumSubscriberRole;
        if (boosterRole) await channel.permissionOverwrites.delete(boosterRole.id, 'No longer a booster channel').catch(() => {});
    }
    return reply(interaction, ok(reopen ? `${channel} is no longer booster-only and everyone can see it again.` : `${channel} is no longer listed as a booster perk. Its permissions weren't changed.`));
}

async function list(interaction) {
    const guild = interaction.guild;
    const perks = await perkStore.get(guild.id);
    const roles = perks.roles.filter((id) => guild.roles.cache.has(id)).map((id) => `<@&${id}>`);
    const channels = perks.channels.filter((id) => guild.channels.cache.has(id)).map((id) => `<#${id}>`);
    const boosterRole = guild.roles.premiumSubscriberRole;

    const embed = new EmbedBuilder()
        .setColor(0xf47fff)
        .setTitle('💎 Booster perks')
        .setDescription(`${guild.premiumSubscriptionCount ?? 0} boosts · level ${guild.premiumTier}${boosterRole ? ` · ${boosterRole}` : ''}`)
        .addFields(
            { name: 'Perk roles', value: roles.join('\n') || '*None. Add one with `/boostperks role add`.*', inline: true },
            { name: 'Booster-only channels', value: channels.join('\n') || '*None. Add one with `/boostperks channel add`.*', inline: true },
        );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boostperks')
        .setDescription('Roles and channels for server boosters')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommandGroup((group) => group.setName('role').setDescription('Roles boosters get while they boost')
            .addSubcommand((sub) => sub.setName('add').setDescription('Give boosters a role while they boost')
                .addRoleOption((opt) => opt.setName('role').setDescription('The perk role').setRequired(true)))
            .addSubcommand((sub) => sub.setName('remove').setDescription('Stop giving boosters a role')
                .addRoleOption((opt) => opt.setName('role').setDescription('The perk role').setRequired(true))
                .addBooleanOption((opt) => opt.setName('take_back').setDescription('Take it from boosters who got it (default: yes)'))))
        .addSubcommandGroup((group) => group.setName('channel').setDescription('Channels only boosters can see')
            .addSubcommand((sub) => sub.setName('add').setDescription('Make a channel booster-only, or create a new one')
                .addChannelOption((opt) => opt.setName('channel').setDescription('Existing channel to make booster-only').addChannelTypes(...PERK_CHANNEL_TYPES))
                .addStringOption((opt) => opt.setName('name').setDescription('Or: name for a new booster-only text channel').setMaxLength(100)))
            .addSubcommand((sub) => sub.setName('remove').setDescription('Stop making a channel booster-only')
                .addChannelOption((opt) => opt.setName('channel').setDescription('The booster channel').setRequired(true).addChannelTypes(...PERK_CHANNEL_TYPES))
                .addBooleanOption((opt) => opt.setName('make_public').setDescription('Let everyone see it again (default: yes)'))))
        .addSubcommand((sub) => sub.setName('list').setDescription('Show the booster perks')),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return reply(interaction, fail('You need the `Manage Server` permission to use this.'));
        }
        const key = [interaction.options.getSubcommandGroup(false), interaction.options.getSubcommand()].filter(Boolean).join(' ');
        switch (key) {
            case 'role add': return addRole(interaction);
            case 'role remove': return removeRole(interaction);
            case 'channel add': return addChannel(interaction);
            case 'channel remove': return removeChannel(interaction);
            default: return list(interaction);
        }
    },
};
