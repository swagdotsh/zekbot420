const { EmbedBuilder } = require('discord.js');
const R6API = require('r6api.js-next').default;

const r6api = new R6API({
    email: process.env.UBISOFT_EMAIL,
    password: process.env.UBISOFT_PASSWORD
});

const r6apiSeasonal = new R6API({
    email: process.env.UBISOFT_EMAIL,
    password: process.env.UBISOFT_PASSWORD,
    ubiAppId: 'e3d5ea9e-50bd-43b7-88bf-39794f4e3d40'
});

const VALID_MODES = ['ranked', 'casual', 'standard'];

module.exports = {
    name: 'r6',
    aliases: ['siege'],
    async execute(message, args) {
        if (!args[0]) return message.reply('Usage: `,r6 <username> [ranked|casual|standard]`');

        const username = args[0];
        const mode = (args[1] || 'ranked').toLowerCase();

        if (!VALID_MODES.includes(mode)) {
            return message.reply(`Invalid mode. Choose from: ${VALID_MODES.join(', ')}`);
        }

        const loading = await message.reply('Fetching R6 stats...');

        try {
            const users = await r6api.findUserByUsername({ platform: 'uplay', usernames: [username] });
            const player = users?.[0];
            if (!player) return loading.edit("Player **"+username+"** not found.");

            const seasonal = await r6apiSeasonal.getUserSeasonalv2({ profileIds: [player.profileId] });
            const profile = seasonal?.find(function(p) { return p.boardSlug === mode });

            const embed = new EmbedBuilder()
                .setTitle(`${player.username} — ${mode.charAt(0).toUpperCase() + mode.slice(1)}`)
                .setColor(0x3a7ebf)
                .addFields(
                    { name: 'Rank', value: profile?.rank?.name || 'Unranked', inline: true },
                    { name: 'RP', value: `${profile?.rank?.rp ?? 0}`, inline: true },
                    { name: 'Max Rank', value: profile?.maxRank?.name || 'Unranked', inline: true },
                    { name: 'K/D', value: ""+profile?.kd ?? 'N/A', inline: true },
                    { name: 'W/L', value: profile?.winRate || 'N/A', inline: true },
                    { name: 'Matches', value: `${profile?.matches ?? 'N/A'}`, inline: true }
                )
                .setFooter({ text: 'Current Season' });

            await loading.edit({ content: '', embeds: [embed] });
        } catch (err) {
            console.error(err);
            await loading.edit('Could not fetch stats. Check the username or try again later.');
        }
    }
};