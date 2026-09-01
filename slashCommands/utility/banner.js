const { SlashCommandBuilder } = require('discord.js');

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

        const banner = user.bannerURL({ extension: 'png', size: 4096 });

        if (!banner) {
            return interaction.reply({ content: 'This user does not have a banner.', ephemeral: true });
        }

        return interaction.reply(banner);
    }
};
