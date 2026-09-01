const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Show a user’s avatar')
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('User to show the avatar for')
                .setRequired(false)
        ),

    execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;

        return interaction.reply(user.displayAvatarURL({ extension: 'png', size: 4096 }));
    }
};
