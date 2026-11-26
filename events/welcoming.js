const { PermissionFlagsBits } = require('discord.js');
const { getMessageConfig, buildMemberMessage } = require('../welcomeStore');

async function sendMemberMessage(guild, member, kind) {
    const config = await getMessageConfig(guild.id, kind);
    if (!config.channelId) return;

    const channel = guild.channels.cache.get(config.channelId);
    if (!channel?.isTextBased()) return;

    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

    const payload = buildMemberMessage(member, config);
    if (!payload.content && !payload.embeds.length) return;

    if (kind === 'goodbye') payload.allowedMentions = { parse: [] };
    await channel.send(payload);
}

module.exports = (client) => {
    client.on('guildMemberAdd', (member) => {
        sendMemberMessage(member.guild, member, 'welcome').catch((err) => {
            console.error('[welcoming] failed to send welcome:', err);
        });
    });

    client.ws.on('GUILD_MEMBER_REMOVE', (data) => {
        const guild = client.guilds.cache.get(data.guild_id);
        if (!guild || !data.user || data.user.bot) return;

        const cached = guild.members.cache.get(data.user.id);
        const user = client.users._add(data.user, false);
        const member = {
            id: user.id,
            user,
            guild,
            displayName: cached?.displayName ?? user.globalName ?? user.username,
            toString: () => `<@${user.id}>`,
        };

        setImmediate(() => {
            sendMemberMessage(guild, member, 'goodbye').catch((err) => {
                console.error('[welcoming] failed to send goodbye:', err);
            });
        });
    });
};
