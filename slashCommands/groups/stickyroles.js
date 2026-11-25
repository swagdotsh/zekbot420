const { PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');

module.exports = defineGroup({
    name: 'stickyroles',
    description: 'Roles that members get back when they rejoin',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    children: [
        { name: 'mode', description: 'Turn sticky roles on or off, or view the status', module: require('../moderation/stickyroles/stickyroles') },
        { name: 'add', module: require('../moderation/stickyroles/addstickyrole') },
        { name: 'remove', module: require('../moderation/stickyroles/removestickyrole') },
        { name: 'user', description: 'Add or remove a sticky role for one member', module: require('../moderation/stickyroles/userstickyroles') },
    ],
});
