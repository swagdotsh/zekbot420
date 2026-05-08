const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    client.on('guildMemberAdd', (member) => {
        try {
            const configPath = path.join(__dirname, '../data', member.guild.id, 'welcomeConfig.json');
            if (!fs.existsSync(configPath)) return;

            const { channelId } = JSON.parse(fs.readFileSync(configPath));
            if (!channelId) return;

            const channel = member.guild.channels.cache.get(channelId);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle(`Welcome ${member.user.username}!`)
                .setDescription('Enjoy your stay!')
                .setThumbnail(member.user.displayAvatarURL())
                .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL() })
                .setFooter({ text: `${member.guild.name} is now at ${member.guild.memberCount} members.` });

            channel.send({ content: `Welcome ${member}!`, embeds: [embed] });
        } catch (err) {
            console.error('[welcoming]', err);
        }
    });
};