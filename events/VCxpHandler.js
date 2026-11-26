const { getConfig, addXp } = require('../leveling');
const { announceLevelUp } = require('./xpHandler');

const VC_XP = 5;
const VC_INTERVAL_MS = 2 * 60 * 1000;

const lastVcXpAward = new Map();

function vcXpAwardKey(guildId, userId) {
    return `${guildId}:${userId}`;
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
    const key = vcXpAwardKey(newState.guild.id, newState.id);

    if (!isEligible(newState)) {
        lastVcXpAward.delete(key);
    } else if (!isEligible(oldState) || !lastVcXpAward.has(key)) {
        lastVcXpAward.set(key, Date.now());
    }
}

async function awardVoiceXp(client) {
    const now = Date.now();
    const seen = new Set();

    for (const guild of client.guilds.cache.values()) {
        const eligible = guild.voiceStates.cache.filter(isEligible);
        if (!eligible.size) continue;

        const config = await getConfig(guild.id);

        for (const voiceState of eligible.values()) {
            const key = vcXpAwardKey(guild.id, voiceState.id);
            seen.add(key);

            if (!lastVcXpAward.has(key)) {
                lastVcXpAward.set(key, now);
                continue;
            }

            if (!config || now - lastVcXpAward.get(key) < VC_INTERVAL_MS) continue;

            lastVcXpAward.set(key, now);
            const result = await addXp(guild.id, voiceState.id, VC_XP);
            if (result.leveledUp) await announceLevelUp(guild, voiceState.id, result.level, config);
        }
    }

    for (const key of lastVcXpAward.keys()) {
        if (!seen.has(key)) lastVcXpAward.delete(key);
    }
}

function startVcXPLoop(client) {
    let running = false;

    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            await awardVoiceXp(client);
        } catch (error) {
            console.error('Voice XP award loop failed:', error);
        } finally {
            running = false;
        }
    }, VC_INTERVAL_MS / 4);
}

module.exports = { handleVoiceXPStateUpdate, startVcXPLoop };
