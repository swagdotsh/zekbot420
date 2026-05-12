const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'banner',
    aliases: ['bn'],
    async execute(message) {
        let user = message.mentions.users.first() || message.author;

        user = await user.fetch(true);

        const banner = user.bannerURL({ dynamic: true, size: 1024 });

        if (!banner) {
            return message.reply('This user does not have a banner.');
        }

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s Banner`)
            .setImage(banner)
            .setColor('#3498db')
            .setFooter({ text: "Requested by " + message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
};