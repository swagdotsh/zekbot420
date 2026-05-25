const {PermissionFlagsBits, ChannelType} = require('discord.js');

const BOT_DEVELOPERS = [
    '495635279387033603'
];

module.exports = {
    name: 'echo',
    async execute(message, args) {
        const isBotDeveloper = BOT_DEVELOPERS.includes(message.author.id);
        const canManageServer = message.member.permissions.has(PermissionFlagsBits.ManageGuild);

        if (!canManageServer && !isBotDeveloper) {
            return message.reply('You need **Manage Server** to use this command.');
        }

        if (!args.length) {
            return message.reply(`Usage: \`${process.env.PREFIX || ','}echo [text] [channel]\``);
        }

        let targetChannel = message.channel;
        let echoArgs = [...args];

        const possibleChannel = echoArgs[echoArgs.length - 1];
        const channelId = possibleChannel?.match(/^<#(\d+)>$/)?.[1] || possibleChannel;

        const foundChannel = message.guild.channels.cache.get(channelId);

        if (
            foundChannel &&
            [
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
            ].includes(foundChannel.type)
        ) {
            targetChannel = foundChannel;
            echoArgs.pop();
        }

        const text = echoArgs.join(' ');

        if (!text) {
            return message.reply('Give me something to echo.');
        }

        await targetChannel.send(text);
    },
};