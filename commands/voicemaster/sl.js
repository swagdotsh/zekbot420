// set vc limit (0-99, 1 is rejected)

const {
    getManagedChannel,
    isVoiceMasterOrStaff,
} = require('./vmManager');

module.exports = {
    name: 'sl',
    aliases: ['setlimit', 'setvcuserlimit'],
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

        if (!args[0]) {
            await voiceChannel.setUserLimit(0, "VoiceMaster limit removed by "+message.author.tag);
            return message.reply('VC user limit removed.');
        }

        const limit = Number(args[0]);

        if (!Number.isInteger(limit) || limit < 0 || limit > 99 || limit === 1) {
            return message.reply(
                'Please provide a user limit from **2** to **99**.\n' +
                'Use `0` or run `,sl` with no input to remove the limit.'
            );
        }

        await voiceChannel.setUserLimit(limit, `VoiceMaster limit changed by ${message.author.tag}`);

        if (limit === 0) {
            return message.reply('VC user limit removed.');
        }

        return message.reply(`VC user limit set to **${limit}**.`);
    },
};