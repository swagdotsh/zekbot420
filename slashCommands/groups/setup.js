const { ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');
const { setConfig: setSocialConfig } = require('../../socialEmbeds');
const { ok } = require('../../ui');

const modlog = require('../moderation/modlog');
const starboard = require('../moderation/starboard');

const textChannelOption = (description) => ({
    type: 7,
    name: 'channel',
    description,
    required: true,
    channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
});

module.exports = defineGroup({
    name: 'setup',
    description: 'Turn on and configure zekbot420 features',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    children: [
        { name: 'birthdays', module: require('../moderation/setupbirthdays') },
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
            description: 'Reply to X and Instagram links with the post text, photos and videos',
            json: {
                options: [
                    { type: 5, name: 'x', description: 'Embed X/Twitter links (default: on)' },
                    { type: 5, name: 'instagram', description: 'Embed Instagram links (default: on)' },
                    { type: 5, name: 'hide_original', description: 'Hide Discord\'s own link preview (needs Manage Messages)' },
                ],
                default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
            },
            async execute(interaction) {
                const changes = { enabled: true };
                const x = interaction.options.getBoolean('x');
                const instagram = interaction.options.getBoolean('instagram');
                const hide = interaction.options.getBoolean('hide_original');
                if (x !== null) changes.x = x;
                if (instagram !== null) changes.instagram = instagram;
                if (hide !== null) changes.hideOriginalEmbed = hide;

                const config = await setSocialConfig(interaction.guild.id, changes);
                const on = [config.x && 'X/Twitter', config.instagram && 'Instagram'].filter(Boolean);
                const notes = [];
                if (!on.length) notes.push('Both platforms are off, so nothing will be embedded.');
                if (config.hideOriginalEmbed && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
                    notes.push('I need `Manage Messages` to hide the original link previews.');
                }

                return interaction.reply({
                    content: ok(`Social embeds are on for ${on.join(' and ') || 'nothing'}. I'll reply to those links with the caption and media.`) +
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
        { name: 'voicemaster', module: require('../voicemaster/setupvm') },
        { name: 'welcome', module: require('../moderation/welcomesetup') },
    ],
});
