const {
    InteractionContextType,
    SlashCommandBuilder,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverbanner')
        .setDescription('Show a user’s server-specific banner')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('User to show the server-specific banner for')
                .setRequired(false)
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        if (!member.banner) {
            return interaction.reply({
                content: "That user doesn't have a server-specific banner set. <:smirk2:1498272372539785286>",
                ephemeral: true,
            });
        }

        return interaction.reply(member.bannerURL({ extension: 'png', size: 4096 }));
    },
};
