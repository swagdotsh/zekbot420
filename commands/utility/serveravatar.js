module.exports = {
    name: 'serveravatar',
    aliases: ['sav'],

    async execute(message) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        const target = message.mentions.members.first() || message.member;
        const member = await message.guild.members.fetch(target.id);

        if (!member.avatar) {
            return message.reply("That user doesn't have a server-specific profile picture set. <:smirk2:1498272372539785286>");
        }

        return message.reply(member.avatarURL({ extension: 'png', size: 4096 }));
    },
};
