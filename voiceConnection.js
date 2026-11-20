const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');

const READY_TIMEOUT_MS = 30 * 1000;
const RECONNECT_GRACE_MS = 5 * 1000;

async function connectVoice(guild, channelId) {
    const connection = joinVoiceChannel({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    } catch (error) {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        throw error;
    }

    return connection;
}

function watchConnection(connection, onLost) {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
                entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
            ]);
        } catch {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        }
    });

    connection.once(VoiceConnectionStatus.Destroyed, () => {
        Promise.resolve()
            .then(onLost)
            .catch((error) => console.error('Voice session cleanup failed:', error));
    });
}

function createSessionOnce(client, guildId, create) {
    if (!client.pendingVoiceSessions) client.pendingVoiceSessions = new Map();

    const pending = client.pendingVoiceSessions.get(guildId);
    if (pending) return pending;

    const promise = Promise.resolve()
        .then(create)
        .finally(() => client.pendingVoiceSessions.delete(guildId));

    client.pendingVoiceSessions.set(guildId, promise);
    return promise;
}

function isConnectionAlive(connection) {
    return Boolean(connection) && connection.state.status !== VoiceConnectionStatus.Destroyed;
}

module.exports = { connectVoice, watchConnection, createSessionOnce, isConnectionAlive };
