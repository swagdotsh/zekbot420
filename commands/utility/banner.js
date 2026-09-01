module.exports = {
    name: 'banner',
    aliases: ['bn'],
    async execute(message) {
        let user = message.mentions.users.first() || message.author;

        user = await user.fetch(true);

        const banner = user.bannerURL({ extension: 'png', size: 4096 });

        if (!banner) {
            return message.reply('This user does not have a banner.');
        }

        return message.reply(banner);
    }
};
