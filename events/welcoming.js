const { PermissionFlagsBits } = require('discord.js');
const { getWelcomeConfig, buildWelcomeMessage } = require('../welcomeStore');

module.exports = (client) => {
    client.on('guildMemberAdd', async (member) => {
        try {
            const config = await getWelcomeConfig(member.guild.id);
            if (!config.channelId) return;

            const channel = member.guild.channels.cache.get(config.channelId);
            if (!channel?.isTextBased()) return;

            const perms = channel.permissionsFor(member.guild.members.me);
            if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

            const payload = buildWelcomeMessage(member, config);
            if (!payload.content && !payload.embeds.length) return;

            await channel.send(payload);
        } catch (err) {
            console.error('[welcoming] failed to send welcome:', err);
        }
    });
};
