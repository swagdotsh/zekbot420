const { PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'level',
    description: 'Change leveling settings',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    children: [
        { name: 'channel', module: require('../leveling/lvlchannel') },
        { name: 'role', description: 'Give roles at certain levels', module: require('../leveling/lvlrole') },
    ],
});
