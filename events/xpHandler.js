const { getConfig, getUser, upsertUser, getLevelRoles } = require('../leveling');

const COOLDOWN_MS = 60 * 1000;

function xpForNextLevel(level) {
    return 500 * (level + 1);
}

async function handleMessageXP(message) {
    if (message.author.bot || !message.guild) return;

    const config = await getConfig(message.guild.id);
    if (!config) return;

    const now = Date.now();
    const existing = await getUser(message.guild.id, message.author.id);

    if (existing && now - Number(existing.last_xp_time) < COOLDOWN_MS) return;

    const xpGain = Math.floor(Math.random() * (config.xp_max - config.xp_min + 1)) + config.xp_min;
    const currentXp = (existing?.xp || 0) + xpGain;
    const currentLevel = existing?.level || 0;
    const xpNeeded = xpForNextLevel(currentLevel);

    let newLevel = currentLevel;
    let leveledUp = false;

    if (currentXp >= xpNeeded) {
        newLevel = currentLevel + 1;
        leveledUp = true;
    }

    await upsertUser(message.guild.id, message.author.id, currentXp, newLevel, now);

    if (leveledUp) {
        if (config.level_channel) {
            const channel = message.guild.channels.cache.get(config.level_channel);
            if (channel) {
                await channel.send({
                    embeds: [{
                        color: 0x5865f2,
                        description: `🎉 <@${message.author.id}> leveled up to **Level ${newLevel}**!`
                    }]
                });
            }
        }

        const roles = await getLevelRoles(message.guild.id);
        const roleToAssign = roles.find(r => r.level === newLevel);
        if (roleToAssign) {
            const member = message.guild.members.cache.get(message.author.id);
            if (member) await member.roles.add(roleToAssign.role_id).catch(console.error);
        }
    }
}

module.exports = { handleMessageXP };