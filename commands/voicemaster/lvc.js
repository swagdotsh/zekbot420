const { PermissionsBitField } = require('discord.js');
const {
    getManagedChannel,
    isVoiceMasterOrStaff,
} = require('./vmManager');

module.exports = {
    name: 'lvc',
    aliases: ['lockvc'],
    async execute(message) {
        const voiceChannel = message.member?.voice?.channel;

        if (!voiceChannel) {
            return message.reply('You need to be in a VoiceMaster VC to use this command.');
        }

        const managed = getManagedChannel(message.client, voiceChannel.id);

        if (!managed) {
            return message.reply('This is not a VoiceMaster VC.');
        }

        if (!isVoiceMasterOrStaff(message.member, managed)) {
            return message.reply('Only the voicemaster or staff with **Manage Channels** can use this command.');
        }

        const everyoneOverwrite = voiceChannel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
        const currentlyLocked = everyoneOverwrite?.deny?.has(PermissionsBitField.Flags.Connect) ?? false;

        await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
            Connect: currentlyLocked ? null : false,
        });

        return message.reply(currentlyLocked ? `VC unlocked.\n-# Tip: To lock, run \`${process.env.PREFIX}lvc\` again.` : `VC locked.\n-# Tip: To unlock, run \`${process.env.PREFIX}lvc\` again.`);
    },
};