const { ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');
const { setConfig: setSocialConfig } = require('../../socialEmbeds');
const { store: confessionStore, confessButtons } = require('../../confessions');
const { store: bumpStore } = require('../../bumpReminders');
const { updateMessageConfig } = require('../../welcomeStore');
const colorRoles = require('../../colorRoles');
const { store: streakStore } = require('../../streaks');
const { store: downloadStore } = require('../../downloads');
const { ok, fail, loading } = require('../../ui');

const modlog = require('../moderation/modlog');
const starboard = require('../moderation/starboard');

const textChannelOption = (description, required = true) => ({
    type: 7,
    name: 'channel',
    description,
    required,
    channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
});

const MANAGE_GUILD = PermissionFlagsBits.ManageGuild.toString();

function missingSendPerms(channel, me, extra = []) {
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, ...extra];
    return !channel.permissionsFor(me)?.has(needed);
}

module.exports = defineGroup({
    name: 'setup',
    description: 'Turn on and configure zekbot420 features',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    children: [
        { name: 'birthdays', module: require('../moderation/setupbirthdays') },
        {
            name: 'boost',
            description: 'Set the channel where a thank-you message is sent when someone boosts',
            json: {
                options: [textChannelOption('Channel to send boost messages in')],
                default_member_permissions: MANAGE_GUILD,
            },
            async execute(interaction) {
                const channel = interaction.options.getChannel('channel', true);
                if (missingSendPerms(channel, interaction.guild.members.me)) {
                    return interaction.reply({ content: fail(`I need the \`View Channel\`, \`Send Messages\` and \`Embed Links\` permissions in ${channel}.`), flags: MessageFlags.Ephemeral });
                }
                await updateMessageConfig(interaction.guild.id, 'boost', (config) => { config.channelId = channel.id; });
                return interaction.reply({
                    content: ok(`Boost messages will be sent in ${channel}. Customize them with \`/boost edit\` and preview with \`/boost test\`.`) +
                        '\n-# Give boosters roles or private channels with `/boostperks`.',
                    flags: MessageFlags.Ephemeral,
                });
            },
        },
        {
            name: 'bumpreminder',
            description: 'Remind the server to bump on DISBOARD (and other listing bots) when the cooldown ends',
            json: {
                options: [
                    textChannelOption('Where reminders go (default: the channel the bump happened in)', false),
                    { type: 8, name: 'role', description: 'Role to ping when it\'s time to bump' },
                ],
                default_member_permissions: MANAGE_GUILD,
            },
            async execute(interaction) {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                if (channel && missingSendPerms(channel, interaction.guild.members.me)) {
                    return interaction.reply({ content: fail(`I need to be able to send messages and embeds in ${channel}.`), flags: MessageFlags.Ephemeral });
                }
                await bumpStore.update(interaction.guild.id, (data) => {
                    data.enabled = true;
                    data.channelId = channel?.id ?? null;
                    data.roleId = role?.id ?? null;
                });
                const where = channel ? `in ${channel}` : 'in the channel where the bump happened';
                return interaction.reply({
                    content: ok(`Bump reminders are on. After a successful \`/bump\` I'll remind ${role ?? 'the channel'} ${where} when it's ready again.`) +
                        '\n-# DISBOARD is tracked automatically. Add other listing bots with `/bumpreminder addbot`.',
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: { parse: [] },
                });
            },
        },
        {
            name: 'colorroles',
            description: 'Pick the channel for the color role panel (or let me create #colors)',
            json: {
                options: [textChannelOption('Where the color panel goes (default: I create #colors)', false)],
                default_member_permissions: PermissionFlagsBits.ManageRoles.toString(),
            },
            async execute(interaction) {
                const channel = interaction.options.getChannel('channel');
                const me = interaction.guild.members.me;
                if (!channel && !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return interaction.reply({ content: fail('I need `Manage Channels` to create #colors. Or pick an existing channel.'), flags: MessageFlags.Ephemeral });
                }
                await interaction.reply({ content: loading('Setting up the color panel...'), flags: MessageFlags.Ephemeral });
                try {
                    const config = await colorRoles.store.get(interaction.guild.id);
                    const target = channel ?? interaction.guild.channels.cache.get(config.channelId) ?? null;
                    const panel = await colorRoles.syncPanel(interaction.guild, { createChannel: true, channel: target });
                    return interaction.editReply(ok(`The color panel is in ${panel}. Add colors with \`/colorrole add <name> <color>\` and they show up there.`) +
                        (channel ? '\n-# Members should be able to add reactions there but not chat. Turn off their `Add Reactions` permission so only my reactions show; they can still react to those.' : ''));
                } catch (error) {
                    return interaction.editReply(fail(error.message));
                }
            },
        },
        {
            name: 'confessions',
            description: 'Let members post anonymous confessions in a channel',
            json: {
                options: [textChannelOption('The channel confessions are posted in')],
                default_member_permissions: MANAGE_GUILD,
            },
            async execute(interaction) {
                const channel = interaction.options.getChannel('channel', true);
                if (missingSendPerms(channel, interaction.guild.members.me)) {
                    return interaction.reply({ content: fail(`I need the \`View Channel\`, \`Send Messages\` and \`Embed Links\` permissions in ${channel}.`), flags: MessageFlags.Ephemeral });
                }
                await confessionStore.update(interaction.guild.id, (data) => { data.channelId = channel.id; });

                await channel.send({
                    content: '🤫 **Anonymous confessions are open!** Press **Confess** or use `/confess`. Nobody, including the moderators, can see who wrote a confession.',
                    components: [confessButtons(null)],
                }).catch(() => {});

                return interaction.reply({
                    content: ok(`Confessions will be posted in ${channel}. Members can use \`/confess\` or the Confess button.`) +
                        '\n-# Moderators can stop someone from confessing with `/confession ban <number>` without seeing who it was.',
                    flags: MessageFlags.Ephemeral,
                });
            },
        },
        {
            name: 'downloads',
            description: 'Let members download videos from links with /download',
            json: { options: [], default_member_permissions: MANAGE_GUILD },
            async execute(interaction) {
                await downloadStore.update(interaction.guild.id, (data) => { data.enabled = true; });
                return interaction.reply({
                    content: ok('Downloads are on. Members can use `/download <link>` to get a video from YouTube, TikTok, X and most other sites.') +
                        '\n-# Videos can be up to 4 minutes. Ones too big for this server\'s upload limit get compressed. Turn it off with `/disable downloads`.',
                    flags: MessageFlags.Ephemeral,
                });
            },
        },
        {
            name: 'goodbye',
            description: 'Set the channel where a message is sent when a member leaves',
            json: {
                options: [textChannelOption('Channel to send goodbye messages in')],
                default_member_permissions: MANAGE_GUILD,
            },
            async execute(interaction) {
                const channel = interaction.options.getChannel('channel', true);
                if (missingSendPerms(channel, interaction.guild.members.me)) {
                    return interaction.reply({ content: fail(`I need the \`View Channel\`, \`Send Messages\` and \`Embed Links\` permissions in ${channel}.`), flags: MessageFlags.Ephemeral });
                }
                await updateMessageConfig(interaction.guild.id, 'goodbye', (config) => { config.channelId = channel.id; });
                return interaction.reply({
                    content: ok(`Goodbye messages will be sent in ${channel}. Customize them with \`/goodbye edit\` and preview with \`/goodbye test\`.`),
                    flags: MessageFlags.Ephemeral,
                });
            },
        },
        { name: 'jail', module: require('../moderation/jail/setupjail') },
        { name: 'leveling', module: require('../leveling/levelsetup') },
        {
            name: 'modlog',
            description: 'Set the channel where moderation logs are sent',
            json: {
                options: [textChannelOption('The channel to send modlog messages to')],
                default_member_permissions: PermissionFlagsBits.Administrator.toString(),
            },
            execute: (interaction) => modlog.runSet(interaction),
            absorbs: [modlog],
        },
        { name: 'reactionmute', module: require('../moderation/rm/rmsetup') },
        {
            name: 'socialembeds',
            description: 'Reply to X, Instagram and TikTok links with the post text, photos and videos',
            json: {
                options: [
                    {
                        type: 3, name: 'trigger', description: 'When to embed (default: only when called)',
                        choices: [
                            { name: 'Only when called, like "zekbot <link>"', value: 'mention' },
                            { name: 'Every X, Instagram and TikTok link', value: 'auto' },
                        ],
                    },
                    { type: 5, name: 'x', description: 'Embed X/Twitter links (default: on)' },
                    { type: 5, name: 'instagram', description: 'Embed Instagram links (default: on)' },
                    { type: 5, name: 'tiktok', description: 'Embed TikTok links (default: on)' },
                    { type: 5, name: 'hide_original', description: 'Hide Discord\'s own link preview (needs Manage Messages)' },
                ],
                default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            },
            async execute(interaction) {
                const changes = { enabled: true };
                const x = interaction.options.getBoolean('x');
                const instagram = interaction.options.getBoolean('instagram');
                const tiktok = interaction.options.getBoolean('tiktok');
                const hide = interaction.options.getBoolean('hide_original');
                const trigger = interaction.options.getString('trigger');
                if (trigger) changes.trigger = trigger;
                if (x !== null) changes.x = x;
                if (instagram !== null) changes.instagram = instagram;
                if (tiktok !== null) changes.tiktok = tiktok;
                if (hide !== null) changes.hideOriginalEmbed = hide;

                const config = await setSocialConfig(interaction.guild.id, changes);
                const on = [config.x && 'X/Twitter', config.instagram && 'Instagram', config.tiktok && 'TikTok'].filter(Boolean);
                const notes = [];
                if (!on.length) notes.push('Every platform is off, so nothing will be embedded.');
                if (config.hideOriginalEmbed && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
                    notes.push('I need `Manage Messages` to hide the original link previews.');
                }

                return interaction.reply({
                    content: ok(`Social embeds are on for ${on.join(', ') || 'nothing'}. ${config.trigger === 'auto'
                        ? "I'll reply to those links with the caption and media."
                        : 'Send `zekbot <link>` (or `zekbot420`, `zkb`, `zk`, `420` or a ping) and I\'ll reply with the caption and media.'}`) +
                        '\n-# Instagram only shares the caption and cover image, so videos and extra photos link back to the post.' +
                        (notes.length ? `\n-# ${notes.join(' ')}` : ''),
                    flags: MessageFlags.Ephemeral,
                });
            },
        },
        {
            name: 'starboard',
            description: 'Set the channel where starred messages appear',
            json: {
                options: [textChannelOption('The starboard channel')],
                default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            },
            execute: (interaction) => starboard.runSet(interaction),
            absorbs: [starboard],
        },
        {
            name: 'streaks',
            description: 'Announce daily message streaks in a channel',
            json: {
                options: [
                    textChannelOption('Where "🔥 X day streak" messages go'),
                    { type: 4, name: 'min_days', description: 'Only announce streaks this long or longer (default: 2)', min_value: 1, max_value: 365 },
                ],
                default_member_permissions: MANAGE_GUILD,
            },
            async execute(interaction) {
                const channel = interaction.options.getChannel('channel', true);
                if (missingSendPerms(channel, interaction.guild.members.me)) {
                    return interaction.reply({ content: fail(`I need the \`View Channel\`, \`Send Messages\` and \`Embed Links\` permissions in ${channel}.`), flags: MessageFlags.Ephemeral });
                }
                const minDays = interaction.options.getInteger('min_days') ?? 2;
                await streakStore.update(interaction.guild.id, (data) => { data.channelId = channel.id; data.minDays = minDays; });
                return interaction.reply({
                    content: ok(`Streaks are on. Members who send a message every day build a streak, and I'll post it in ${channel} from day ${minDays} on.`) +
                        '\n-# Days follow each member\'s `/time timezone` (UTC if they haven\'t set one). Members can check theirs with `/streak view`.',
                    flags: MessageFlags.Ephemeral,
                });
            },
        },
        { name: 'voicemaster', module: require('../voicemaster/setupvm') },
        { name: 'welcome', module: require('../moderation/welcomesetup') },
    ],
});
