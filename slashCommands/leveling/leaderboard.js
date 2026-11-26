const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const { getLeaderboard, getConfig } = require('../../leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the server XP leaderboard')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0),

    async execute(interaction) {
        const config = await getConfig(interaction.guild.id);

        if (!config?.lb_enabled) {
            return interaction.reply({
                content: 'The leaderboard is disabled in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const rows = await getLeaderboard(interaction.guild.id, 10);

        if (!rows.length) {
            return interaction.reply({
                content: 'No one has earned XP yet.',
                flags: MessageFlags.Ephemeral
            });
        }

        const medals = ['🥇', '🥈', '🥉'];

        const description = rows
            .map((row, i) => {
                const prefix = medals[i] || `**#${i + 1}**`;
                return `${prefix} <@${row.user_id}> — Level ${row.level} (${row.xp} XP)`;
            })
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🏆 ${interaction.guild.name} Leaderboard`)
            .setDescription(description);

        return interaction.reply({
            embeds: [embed]
        });
    }
};