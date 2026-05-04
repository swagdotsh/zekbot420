const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType
} = require('discord.js');
const { logUnban } = require('../../log');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption((opt) =>
            opt
                .setName('identifier')
                .setDescription('User ID or tag to unban')
                .setRequired(true)
        ),

    async execute(interaction) {
        const identifier = interaction.options.getString('identifier');

        try {
            const bans = await interaction.guild.bans.fetch();

            const target = bans.find((ban) =>
                ban.user.id === identifier ||
                ban.user.tag.toLowerCase() === identifier.toLowerCase()
            );

            if (!target) {
                return interaction.reply({
                    content: 'User not found in ban list.',
                    ephemeral: true
                });
            }

            await interaction.guild.members.unban(target.user.id);

            await logUnban(interaction.client, interaction.guild, target.user, interaction.user);

            return interaction.reply(`${target.user.tag} has been unbanned.`);
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Failed to unban the user.',
                ephemeral: true
            });
        }
    }
};