const { getConfig, getUser, upsertUser, getLevelRoles, startVcSession, endVcSession, getAllVcSessions } = require('../leveling');

const VC_XP = 5;
const VC_INTERVAL_MS = 2 * 60 * 1000;

const lastVcXpAward = new Map();
let vcXpLoopRunning = false;

function vcXpAwardKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

async function endTrackedVcSession(guildId, userId) {
    await endVcSession(guildId, userId);
    lastVcXpAward.delete(vcXpAwardKey(guildId, userId));
}

function xpForNextLevel(level) {
    return 500 * (level + 1);
}

async function handleVcXP(client, guildId, userId) {
    const config = await getConfig(guildId);
    if (!config) return false;

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

    return true;
}

function isEligible(voiceState) {
    return Boolean(
        voiceState?.channelId &&
        !voiceState.member?.user?.bot &&
        !voiceState.deaf &&
        !voiceState.selfDeaf
    );
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
        if (vcXpLoopRunning) return;
        vcXpLoopRunning = true;

        try {
            const sessions = await getAllVcSessions();
            const activeSessionKeys = new Set(
                sessions.map(session => vcXpAwardKey(session.guild_id, session.user_id))
            );

            for (const key of lastVcXpAward.keys()) {
                if (!activeSessionKeys.has(key)) {
                    lastVcXpAward.delete(key);
                }
            }

            for (const session of sessions) {
                const key = vcXpAwardKey(session.guild_id, session.user_id);
                const now = Date.now();
                const last = lastVcXpAward.get(key) || 0;

                if (now - last < VC_INTERVAL_MS) continue;

                const guild = client.guilds.cache.get(session.guild_id);
                if (!guild) continue;

                const member = guild.members.cache.get(session.user_id);
                if (!member?.voice?.channel) continue;
                if (!isEligible(member.voice)) continue;

                try {
                    const xpWritten = await handleVcXP(client, session.guild_id, session.user_id);

                    if (xpWritten) {
                        lastVcXpAward.set(key, now);
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        } catch (error) {
            console.error('Voice XP award loop failed:', error);
        } finally {
            vcXpLoopRunning = false;
        }
    }, VC_INTERVAL_MS);
}

module.exports = { handleVoiceXPStateUpdate, startVcXPLoop };
