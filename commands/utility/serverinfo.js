const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'serverinfo',
    aliases: ['si', 'guildinfo'],
    async execute(message) {
        const guild = message.guild;

        const owner = await guild.fetchOwner();
        const roles = guild.roles.cache.size;
        const members = guild.memberCount;
        const channels = guild.channels.cache.size;
        const boosts = guild.premiumSubscriptionCount || 0;
        const boostLevel = guild.premiumTier;
        const vcs = guild.channels.cache.filter(c => c.type === 2).size;
        const categories = guild.channels.cache.filter(c => c.type === 4).size;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = guild.members.cache.filter(m => !m.user.bot).size;
        const created = Math.floor(guild.createdTimestamp / 1000);
        const banner = guild.bannerURL({ dynamic: true, size: 1024 });

        const embed = new EmbedBuilder()
            .setColor('Random')
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Owner', value: `<@${owner.id}>`, inline: true },
                { name: 'Members', value: `${members}`, inline: true },
                { name: 'Humans', value: `${humans}`, inline: true },
                { name: 'Bots', value: `${bots}`, inline: true },
                { name: 'Roles', value: `${roles}`, inline: true },
                { name: 'Channels', value: `${channels}`, inline: true },
                { name: 'Voice Channels', value: `${vcs}`, inline: true },
                { name: 'Categories', value: `${categories}`, inline: true },
                { name: 'Boosts', value: `${boosts}`, inline: true },
                { name: 'Boost Level', value: `Tier ${boostLevel}`, inline: true },
                { name: 'Created', value: `<t:${created}:F> (<t:${created}:R>)`, inline: false },
                { name: 'Banner', value: banner ? `[Click here](${banner})` : 'None', inline: false }
            )
            .setFooter({ text: `Server ID: ${guild.id}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
};