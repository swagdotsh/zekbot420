module.exports = {
    name: 'serverbanner',
    aliases: ['sbanner', 'sbn'],

    async execute(message) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        const target = message.mentions.members.first() || message.member;
        const member = await message.guild.members.fetch(target.id);

        if (!member.banner) {
            return message.reply("That user doesn't have a server-specific banner set. <:smirk2:1498272372539785286>");
        }

        return message.reply(member.bannerURL({ extension: 'png', size: 4096 }));
    },
};
