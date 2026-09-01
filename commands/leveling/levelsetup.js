const { setConfig } = require('../../leveling');

module.exports = {
    name: 'levelsetup',
    aliases: ['levelconfig', 'lvlconfig', 'lvlsetup'],
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need the **Manage Server** permission to run this. <:smirk2:1498272372539785286>');
        }

        const flags = {};
        for (let i = 0; i < args.length; i++) {
            if (args[i].startsWith('--')) {
                flags[args[i].slice(2)] = args[i + 1];
                i++;
            }
        }

        const channelMention = flags['channel'];
        const xpRange = flags['xp'];
        const lbFlag = flags['lb'];

        if (!channelMention || !xpRange || !lbFlag) {
            return message.reply(
                'Usage: `,levelsetup --channel #channel --xp 10-30 --lb yes/no`\n' +
                'XP range must be between 5 and 45 (e.g. `10-30`, `5-20`)'
            );
        }

        const channelId = channelMention.replace(/[<#>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);
        if (!channel) return message.reply('Invalid channel.');

        const [minStr, maxStr] = xpRange.split('-');
        const xpMin = parseInt(minStr);
        const xpMax = parseInt(maxStr);

        if (isNaN(xpMin) || isNaN(xpMax) || xpMin < 5 || xpMax > 45 || xpMin >= xpMax) {
            return message.reply('Invalid XP range. Min must be ≥ 5, max must be ≤ 45, and min must be less than max.');
        }

        const lbEnabled = lbFlag.toLowerCase() === 'yes';

        try {
            await setConfig(message.guild.id, {
                levelChannel: channelId,
                xpMin,
                xpMax,
                lbEnabled
            });

            await message.reply({
                embeds: [{
                    color: 0x5865f2,
                    title: '✅ Leveling Setup Complete',
                    fields: [
                        { name: 'Level-up Channel', value: `<#${channelId}>`, inline: true },
                        { name: 'XP Range', value: `${xpMin}–${xpMax} per message`, inline: true },
                        { name: 'Leaderboard', value: lbEnabled ? 'Enabled' : 'Disabled', inline: true }
                    ]
                }]
            });
        } catch (err) {
            console.error(err);
            await message.reply('Something went wrong saving the config.');
        }
    }
};
