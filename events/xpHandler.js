const { getConfig, getXpState, addXp, getLevelRoles } = require('../leveling');

const COOLDOWN_MS = 60 * 1000;

async function announceLevelUp(guild, userId, newLevel, config) {
    if (config.level_channel) {
        const channel = guild.channels.cache.get(config.level_channel);
        if (channel) {
            await channel.send({
                allowedMentions: { users: [userId] },
                embeds: [{
                    color: 0x5865f2,
                    description: `🎉 <@${userId}> leveled up to **Level ${newLevel}**!`
                }]
            }).catch(console.error);
        }
    }

    const roles = await getLevelRoles(guild.id);
    const roleToAssign = roles.find(r => r.level === newLevel);
    if (roleToAssign) {
        const member = guild.members.cache.get(userId);
        if (member) await member.roles.add(roleToAssign.role_id, `Reached level ${newLevel}`).catch(console.error);
    }
}

async function handleMessageXP(message) {
    if (message.author.bot || !message.guild) return;

    const config = await getConfig(message.guild.id);
    if (!config) return;

    const now = Date.now();
    const state = await getXpState(message.guild.id, message.author.id);
    if (now - state.lastXpTime < COOLDOWN_MS) return;

    const xpGain = Math.floor(Math.random() * (config.xp_max - config.xp_min + 1)) + config.xp_min;
    const result = await addXp(message.guild.id, message.author.id, xpGain, { lastXpTime: now });

    if (result.leveledUp) await announceLevelUp(message.guild, message.author.id, result.level, config);
}

module.exports = { handleMessageXP, announceLevelUp };
