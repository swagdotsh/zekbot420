const { setTtsChannel } = require('../../ttsHandler');

module.exports = {
    name: 'ttschannel',
    aliases: ['ttsch'],
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need **Manage Server** to set the TTS channel. <:smirk2:1498272372539785286>');
        }

        try {
            if (args[0] && ['off', 'none', 'reset'].includes(args[0].toLowerCase())) {
                await setTtsChannel(message.guild.id, null);
                return message.reply('Removed the TTS channel. Only VC chats will be read now.');
            }

            // no channel given = use the one the command was ran in
            const channel = args[0]
                ? message.mentions.channels.find(c => c.guildId === message.guild.id) || message.guild.channels.cache.get(args[0])
                : message.channel;

            if (!channel || !channel.isTextBased()) {
                return message.reply("That's not a valid text channel. <:smirk2:1498272372539785286>");
            }

            await setTtsChannel(message.guild.id, channel.id);
            return message.reply(`TTS channel set to <#${channel.id}>. VC chats still work too.\n-# \`${process.env.PREFIX}ttschannel off\` to remove it.`);
        } catch (err) {
            console.error('ttschannel command failed:', err);
            return message.reply("Couldn't update the TTS channel. <:smirk2:1498272372539785286>");
        }
    }
};
