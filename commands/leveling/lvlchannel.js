const { setLevelChannel } = require('../../leveling');

module.exports = {
    name: 'lvlchannel',
    aliases: ['lvlchannelset', 'levelchannel'],
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need the **Manage Server** permission to run this. <:smirk2:1498272372539785286>');
        }

        const channelId = args[0]?.replace(/[<#>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);
        if (!channel) return message.reply('Please mention a valid channel.');

        try {
            await setLevelChannel(message.guild.id, channelId);
            await message.reply(`Level-up announcements will now be sent to <#${channelId}>.`);
        } catch (err) {
            console.error(err);
            await message.reply('Something went wrong updating the channel.');
        }
    }
};
