const {
    getManagedChannel,
    isVoiceMasterOrStaff,
} = require('./vmManager');

module.exports = {
    name: 'rmvc',
    aliases: ['renamevc'],
    async execute(message, args) {
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

        const newNameInput = args.join(' ').trim();
        let newName = newNameInput;

        if (!newNameInput) {
            const owner = await message.guild.members.fetch(managed.ownerId).catch(() => null);
            const ownerName = owner?.displayName || 'User';

            newName = `${ownerName}'s VC`;
        }

        if (newName.length > 100) {
            return message.reply('VC name must be **100 characters or fewer**.');
        }

        await voiceChannel.setName(newName, "VoiceMaster VC renamed by "+message.author.tag);

        if (!newNameInput) {
            return message.reply(`VC name reset to **${newName}**.`);
        }

        return message.reply(`VC renamed to **${newName}**.`);
    },
};