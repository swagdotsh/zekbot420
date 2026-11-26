const { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } = require('discord.js');
const streaks = require('../../streaks');
const { fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('Daily message streaks: send a message every day to keep yours going')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addSubcommand((sub) => sub.setName('view').setDescription('See your streak or someone else\'s')
            .addUserOption((opt) => opt.setName('user').setDescription('Whose streak to see (default: yours)')))
        .addSubcommand((sub) => sub.setName('leaderboard').setDescription('The longest streaks going right now')),

    async execute(interaction) {
        const config = await streaks.store.get(interaction.guild.id);
        if (!config.channelId) {
            return interaction.reply({ content: fail('Streaks aren\'t on in this server. A moderator can turn them on with `/setup streaks`.'), flags: MessageFlags.Ephemeral });
        }

        if (interaction.options.getSubcommand() === 'leaderboard') {
            const rows = await streaks.leaderboard(interaction.guild.id);
            const medals = ['🥇', '🥈', '🥉'];
            const embed = new EmbedBuilder()
                .setColor(0xff7a00)
                .setTitle(`🔥 Streak leaderboard`)
                .setDescription(rows.length
                    ? rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.userId}> · **${r.count}** day${r.count === 1 ? '' : 's'} (best ${r.best})`).join('\n')
                    : '*Nobody has a streak going yet. Send a message to start one!*')
                .setFooter({ text: 'Send at least one message a day to keep your streak.' });
            return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
        }

        const user = interaction.options.getUser('user') ?? interaction.user;
        const entry = config.users[user.id];
        const count = await streaks.currentStreak(user.id, entry);
        const countedToday = entry?.lastDay === await streaks.today(user.id);
        const self = user.id === interaction.user.id;

        const status = !count
            ? `${self ? 'You don\'t' : `${user} doesn't`} have a streak going. ${self ? 'Send a message to start one!' : ''}`
            : countedToday
                ? `✅ ${self ? 'You\'ve' : 'They\'ve'} already kept it going today.`
                : `⚠️ ${self ? 'Send' : 'They need to send'} a message today to keep it going!`;

        const embed = new EmbedBuilder()
            .setColor(count ? 0xff7a00 : 0x2b2d31)
            .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
            .setTitle(count ? `🔥 ${count} day streak` : 'No streak')
            .setDescription(status)
            .addFields({ name: 'Best streak', value: `${entry?.best ?? 0} day${entry?.best === 1 ? '' : 's'}`, inline: true });
        return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    },
};
