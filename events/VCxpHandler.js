const { getConfig, getUser, upsertUser, getLevelRoles, startVcSession, endVcSession, getAllVcSessions } = require('../leveling');

const VC_XP = 5;
const VC_INTERVAL_MS = 2 * 60 * 1000;

function xpForNextLevel(level) {
    return 500 * (level + 1);
}

async function handleVcXP(client, guildId, userId) {
    const config = await getConfig(guildId);
    if (!config) return;

    const existing = await getUser(guildId, userId);
    const currentXp = (existing?.xp || 0) + VC_XP;
    const currentLevel = existing?.level || 0;
    const xpNeeded = xpForNextLevel(currentLevel);

    let newLevel = currentLevel;
    let leveledUp = false;

    if (currentXp >= xpNeeded) {
        newLevel = currentLevel + 1;
        leveledUp = true;
    }

    await upsertUser(guildId, userId, currentXp, newLevel, existing?.last_xp_time || 0);

    if (leveledUp && config.level_channel) {
        const guild = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(config.level_channel);
        if (channel) {
            await channel.send({
                embeds: [{
                    color: 0x5865f2,
                    description: `🎉 <@${userId}> leveled up to **Level ${newLevel}**!`
                }]
            });
        }

        const roles = await getLevelRoles(guildId);
        const roleToAssign = roles.find(r => r.level === newLevel);
        if (roleToAssign) {
            const member = guild?.members.cache.get(userId);
            if (member) await member.roles.add(roleToAssign.role_id).catch(console.error);
        }
    }
}

function isEligible(state) {
    if (state.deaf) return false;
    const guild = state.channel?.guild;
    if (!guild) return false;
    if (guild.afkChannelId && state.channelId === guild.afkChannelId) return false;
    return true;
}

async function handleVoiceXPStateUpdate(oldState, newState) {
    const userId = newState.id;
    const guildId = newState.guild.id;

    const justJoined = !oldState.channelId && newState.channelId;
    const justLeft = oldState.channelId && !newState.channelId;
    const becameDeafened = !oldState.deaf && newState.deaf;
    const undeafened = oldState.deaf && !newState.deaf;

    if (justJoined && isEligible(newState)) {
        await startVcSession(guildId, userId);
    } else if (justLeft || becameDeafened) {
        await endVcSession(guildId, userId);
    } else if (undeafened && newState.channelId) {
        await startVcSession(guildId, userId);
    }
}

function startVcXPLoop(client) {
    setInterval(async () => {
        const sessions = await getAllVcSessions();
        for (const session of sessions) {
            const guild = client.guilds.cache.get(session.guild_id);
            if (!guild) continue;
            const member = guild.members.cache.get(session.user_id);
            if (!member?.voice?.channel) continue;
            if (!isEligible(member.voice)) continue;
            await handleVcXP(client, session.guild_id, session.user_id).catch(console.error);
        }
    }, VC_INTERVAL_MS);
}

module.exports = { handleVoiceXPStateUpdate, startVcXPLoop };