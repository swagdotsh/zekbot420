const {
    InteractionContextType,
    SlashCommandBuilder,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serveravatar')
        .setDescription('Show a user’s server-specific profile picture')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('User to show the server-specific profile picture for')
                .setRequired(false)
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        if (!member.avatar) {
            return interaction.reply({
                content: "That user doesn't have a server-specific profile picture set. <:smirk2:1498272372539785286>",
                ephemeral: true,
            });
        }

        return interaction.reply(member.avatarURL({ extension: 'png', size: 4096 }));
    },
};
