const {
    getManagedChannel,
    isVoiceMasterOrStaff,
} = require('./vmManager');

function getTargetMember(message, args) {
    const mentioned = message.mentions.members.first();
    if (mentioned) return mentioned;

    const raw = args[0]?.replace(/[<@!>]/g, '');
    if (!raw) return null;

    return message.guild.members.cache.get(raw) ?? null;
}

module.exports = {
    name: 'kvc',
    aliases: ['kickvc'],
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

        const target = getTargetMember(message, args);

        if (!target) {
            return message.reply('Please mention a user or provide their user ID.');
        }

        if (target.id === message.author.id) {
            return message.reply('You cannot kick yourself from the VC with this command.');
        }

        if (target.voice?.channelId !== voiceChannel.id) {
            return message.reply('That user is not in your VoiceMaster VC.');
        }

        await target.voice.disconnect("Kicked from VoiceMaster VC by "+message.author.tag);

        return message.reply("Kicked **"+target.displayName+"** from the VC.");
    },
};