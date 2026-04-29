const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'welcomeConfig.json');

module.exports = {
  async handle(client) {
    client.on('guildMemberAdd', async (member) => {
      const guildId = member.guild.id;

      if (!fs.existsSync(configPath)) return;
      const config = JSON.parse(fs.readFileSync(configPath));
      const channelId = config[guildId];
      if (!channelId) return;

      const channel = member.guild.channels.cache.get(channelId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle("Welcome "+member.user.username+"!")
        .setDescription('Enjoy your stay!')
        .setThumbnail(member.user.displayAvatarURL())
        .setAuthor({
          name: member.guild.name,
          iconURL: member.guild.iconURL(),
        })
        .setFooter({
          text: ""+member.guild.name+" is now at "+member.guild.memberCount+" members.",
        });

      channel.send({ content: `Welcome ${member}!`, embeds: [embed] });
    });
  }
};
