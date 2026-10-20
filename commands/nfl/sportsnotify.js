const { setNotifyChannel, getNotifyChannel } = require('../../nflHandler');

module.exports = {
    name: 'sportsnotify',
    aliases: ['nflchannel', 'sportschannel'],
    async execute(message, args) {
        if (!message.guild) return message.reply('This only works in a server.');

        const prefix = process.env.PREFIX;

        if (!args.length) {
            const channelId = await getNotifyChannel(message.guild.id);
            return message.reply(channelId
                ? `Big play pings go to <#${channelId}>. Turn it off with \`${prefix}sportsnotify off\`.`
                : `No sports channel set, so big play pings get DMed. Set one with \`${prefix}sportsnotify #channel\`.`);
        }

        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need the **Manage Server** permission to run this. <:smirk2:1498272372539785286>');
        }

        if (['off', 'none', 'disable', 'reset'].includes(args[0].toLowerCase())) {
            await setNotifyChannel(message.guild.id, null);
            return message.reply('Sports channel removed, big play pings will be DMed instead.');
        }

        const channelId = args[0].replace(/[<#>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return message.reply('Please mention a valid text channel.');

        const me = message.guild.members.me;
        if (!channel.permissionsFor(me).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            return message.reply(`I can't send embeds in <#${channelId}>, give me **Send Messages** and **Embed Links** there first.`);
        }

        await setNotifyChannel(message.guild.id, channelId);
        message.reply(`Big play pings for people in this server will now go to <#${channelId}>. 🏈`);
    }
};
