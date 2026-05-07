const { R6Client } = require('r6-data.js');
const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');

const r6 = new R6Client({ apiKey: process.env.R6DATA_API_KEY });

const RANK_NAMES = [
    'Unranked',
    'Copper V', 'Copper IV', 'Copper III', 'Copper II', 'Copper I',
    'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
    'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
    'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
    'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
    'Emerald V', 'Emerald IV', 'Emerald III', 'Emerald II', 'Emerald I',
    'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
    'Champion'
];

const RANK_EMOJIS = [
    '<:unrr6:1501983341308547152>',
    '<:copperr6:1501983130872188999>',
    '<:copperr6:1501983130872188999>',
    '<:copperr6:1501983130872188999>',
    '<:copperr6:1501983130872188999>',
    '<:copperr6:1501983130872188999>',
    '<:bronzer6:1501983131958251652>',
    '<:bronzer6:1501983131958251652>',
    '<:bronzer6:1501983131958251652>',
    '<:bronzer6:1501983131958251652>',
    '<:bronzer6:1501983131958251652>',
    '<:silverr6:1501983132935520378>',
    '<:silverr6:1501983132935520378>',
    '<:silverr6:1501983132935520378>',
    '<:silverr6:1501983132935520378>',
    '<:silverr6:1501983132935520378>',
    '<:goldr6:1501983129123164252>',
    '<:goldr6:1501983129123164252>',
    '<:goldr6:1501983129123164252>',
    '<:goldr6:1501983129123164252>',
    '<:goldr6:1501983129123164252>',
    '<:platr6:1501983134382686379>',
    '<:platr6:1501983134382686379>',
    '<:platr6:1501983134382686379>',
    '<:platr6:1501983134382686379>',
    '<:platr6:1501983134382686379>',
    '<:emr6:1501983135850565712>',
    '<:emr6:1501983135850565712>',
    '<:emr6:1501983135850565712>',
    '<:emr6:1501983135850565712>',
    '<:emr6:1501983135850565712>',
    '<:diamr6:1501983126296199168>',
    '<:diamr6:1501983126296199168>',
    '<:diamr6:1501983126296199168>',
    '<:diamr6:1501983126296199168>',
    '<:diamr6:1501983126296199168>',
    '<:champr6:1501983127768141844>',
]; // sigh

module.exports = {
    data: new SlashCommandBuilder()
        .setName('r6stats')
        .setDescription('Fetch Rainbow Six Siege stats for a player')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption(option =>
            option.setName('username')
                .setDescription('The player\'s username')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Account platform (default: PC)')
                .addChoices(
                    { name: 'PC', value: 'pc' },
                    { name: 'PlayStation', value: 'psn' },
                    { name: 'Xbox', value: 'xbox' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const username = interaction.options.getString('username');
        const platformArg = interaction.options.getString('platform') ?? 'pc';

        const platformMap = {
            pc: 'uplay',
            psn: 'psn',
            xbox: 'xbl'
        };

        const platformType = platformMap[platformArg];
        const displayPlatform = platformArg;
        const platform_families = platformType === 'uplay' ? 'pc' : 'console';

        try {
            const [account, statsData] = await Promise.all([
                r6.players.getAccountInfo({
                    nameOnPlatform: username,
                    platformType
                }),
                r6.players.getPlayerStats({
                    nameOnPlatform: username,
                    platformType,
                    platform_families
                })
            ]);

            const boardProfiles = statsData?.platform_families_full_profiles?.[0]?.board_ids_full_profiles ?? [];

            const getBoard = (id) => {
                const board = boardProfiles.find(b => b.board_id === id);
                const profile = board?.full_profiles?.[0]?.profile;
                const stats = board?.full_profiles?.[0]?.season_statistics;

                return profile && stats ? { ...profile, ...stats } : null;
            };

            const ranked = getBoard('ranked');
            const casual = getBoard('casual');
            const src = ranked ?? casual;

            if (!src) {
                return interaction.editReply(`No stats found for **${username}**.`);
            }

            const totalMatches = src.wins + src.losses + (src.abandons ?? src.abandon ?? 0);

            const kd = src.deaths > 0
                ? (src.kills / src.deaths).toFixed(2)
                : src.kills.toString();

            const winRate = totalMatches > 0
                ? `${((src.wins / totalMatches) * 100).toFixed(1)}%`
                : 'N/A';

            const rankName = RANK_NAMES[src.rank] ?? 'Unknown';
            const maxRankName = RANK_NAMES[src.max_rank] ?? 'Unknown';

            const rankEmoji = RANK_EMOJIS[src.rank] ?? '';
            const maxRankEmoji = RANK_EMOJIS[src.max_rank] ?? '';

            const embed = new EmbedBuilder()
                .setColor(0xF99E1A)
                .setTitle(`${username}'s R6 Stats`)
                .setDescription(
                    `**Platform:** ${displayPlatform.toUpperCase()} • **Mode:** ${ranked ? 'Ranked' : 'Casual'} • **Account Level:** ${account.level ?? 'N/A'}`
                )
                .addFields(
                    {
                        name: 'Rank',
                        value: `${rankEmoji} ${rankName} (${src.rank_points} RP)`,
                        inline: true
                    },
                    {
                        name: 'Peak',
                        value: `${maxRankEmoji} ${maxRankName} (${src.max_rank_points} RP)`,
                        inline: true
                    },
                    {
                        name: 'Matches',
                        value: `${totalMatches.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: 'Wins',
                        value: `${src.wins.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: 'Kills',
                        value: `${src.kills.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: 'K/D',
                        value: kd,
                        inline: true
                    },
                    {
                        name: 'Win Rate',
                        value: winRate,
                        inline: true
                    }
                )
                .setFooter({ text: 'Powered by r6data.eu' })
                .setTimestamp();

            if (account.profilePicture) {
                embed.setThumbnail(account.profilePicture);
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(err);

            if (err?.message?.includes('not found') || err?.status === 404) {
                return interaction.editReply(`Player **${username}** not found.`);
            }

            return interaction.editReply('Failed to fetch stats. Try again later.');
        }
    }
};