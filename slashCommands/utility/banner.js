const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banner')
        .setDescription('Show a user’s banner')
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('User to show the banner for')
                .setRequired(false)
        ),

    async execute(interaction) {
        let user = interaction.options.getUser('user') || interaction.user;

        user = await user.fetch(true);

        const banner = user.bannerURL({ extension: 'png', size: 1024 });

        if (!banner) {
            return interaction.reply({ content: 'This user does not have a banner.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s Banner`)
            .setImage(banner)
            .setColor('#3498db')
            .setFooter({
                text: `Requested by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};