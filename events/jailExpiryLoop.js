const { getExpiredJails, getJailConfig } = require('../jailHandler');
const { doUnjail } = require('../commands/moderation/jail/unjail');
const { logUnjail } = require('../log');

function startJailExpiryLoop(client) {
    let isRunning = false;

    const checkExpiredJails = async () => {
        if (isRunning) return;
        isRunning = true;

        try {
        const expired = await getExpiredJails();
        for (const row of expired) {
            const guild = client.guilds.cache.get(row.guild_id);
            if (!guild) continue;
            const config = await getJailConfig(row.guild_id);
            if (!config) continue;

            const success = await doUnjail(guild, row.user_id, config).catch(() => false);
            if (success) {
                const jailChannel = guild.channels.cache.get(config.jail_channel_id);
                if (jailChannel) {
                    await jailChannel.send({
                        embeds: [{
                            color: 0x00ff00,
                            description: `🔓 <@${row.user_id}>'s jail sentence has expired. They have been released.`
                        }]
                    }).catch(() => {});
                }
            }
            await logUnjail(null, guild, { id: row.user_id, user: await guild.members.fetch(row.user_id).then(m => m.user).catch(() => null) }, null, true);
        }
        } catch (error) {
            console.error('Jail expiry check failed:', error);
        } finally {
            isRunning = false;
        }
    };

    setInterval(() => {
        checkExpiredJails().catch(console.error);
    }, 30 * 1000);

    checkExpiredJails().catch(console.error);
}

module.exports = { startJailExpiryLoop };
