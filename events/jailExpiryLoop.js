const { getExpiredJails, getJailConfig, unjailUser } = require('../jailHandler');
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

            const member = await doUnjail(guild, row.user_id, config).catch((error) => {
                console.error(`Failed to release ${row.user_id} from jail in ${row.guild_id}:`, error);
                return null;
            });

            // they left the server, nothing to restore so just drop the record instead of retrying forever
            if (member === false) {
                await unjailUser(row.guild_id, row.user_id);
                continue;
            }

            // restore failed, try again next tick
            if (!member) continue;

            const jailChannel = guild.channels.cache.get(config.jail_channel_id);
            if (jailChannel) {
                await jailChannel.send({
                    embeds: [{
                        color: 0x00ff00,
                        description: `🔓 <@${row.user_id}>'s jail sentence has expired. They have been released.`
                    }]
                }).catch(() => {});
            }

            await logUnjail(null, guild, member, null, true);
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
