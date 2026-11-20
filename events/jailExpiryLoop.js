const { getExpiredJails, getNextJailExpiry, getJailConfig, unjailUser } = require('../jailHandler');
const { createDueScheduler } = require('../dueScheduler');
const { doUnjail } = require('../commands/moderation/jail/unjail');
const { logUnjail } = require('../log');

function startJailExpiryLoop(client) {
    const releaseExpiredJails = async () => {
        let hadFailures = false;
        const expired = await getExpiredJails();
        for (const row of expired) {
            const guild = client.guilds.cache.get(row.guild_id);
            if (!guild) { hadFailures = true; continue; }
            const config = await getJailConfig(row.guild_id);
            if (!config) { hadFailures = true; continue; }

            const member = await doUnjail(guild, row.user_id, config).catch((error) => {
                console.error(`Failed to release ${row.user_id} from jail in ${row.guild_id}:`, error);
                return null;
            });

            if (member === false) {
                await unjailUser(row.guild_id, row.user_id);
                continue;
            }

            if (!member) { hadFailures = true; continue; }

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
        return hadFailures;
    };

    createDueScheduler('jails', {
        runDue: releaseExpiredJails,
        getNextDue: getNextJailExpiry,
    }).start();
}

module.exports = { startJailExpiryLoop };
