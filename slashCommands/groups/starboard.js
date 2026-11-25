const { PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'starboard',
    description: 'Change starboard settings',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    children: [
        { name: 'threshold', module: require('../moderation/starboardthreshold') },
        { name: 'emoji', module: require('../moderation/staremoji') },
        { name: 'selfstar', module: require('../moderation/starboardself') },
    ],
});
