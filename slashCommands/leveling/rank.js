const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { getUser } = require('../../leveling');

function xpForNextLevel(level) {
    return 500 * (level + 1);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Show your or another user’s rank')
        .setContexts(InteractionContextType.Guild)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to check')
                .setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const data = await getUser(interaction.guild.id, target.id);

        if (!data) {
            return interaction.reply({
                content: target.id === interaction.user.id
                    ? "You haven't earned any XP yet. Start chatting!"
                    : "That user hasn't earned any XP yet.",
                ephemeral: true
            });
        }

        const nextLevelXp = xpForNextLevel(data.level);

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setAuthor({
                name: target.username,
                iconURL: target.displayAvatarURL()
            })
            .addFields(
                {
                    name: 'Level',
                    value: `${data.level}`,
                    inline: true
                },
                {
                    name: 'XP',
                    value: `${data.xp} / ${nextLevelXp}`,
                    inline: true
                }
            );

        return interaction.reply({
            embeds: [embed]
        });
    }
};