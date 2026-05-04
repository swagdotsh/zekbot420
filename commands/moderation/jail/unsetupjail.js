const { getJailConfig, deleteJailConfig } = require('../../../jailHandler');

module.exports = {
    name: 'unsetupjail',
    aliases: ['unsjail'],
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need the **Manage Server** permission to run this.');
        }

        const guild = message.guild;
        const config = await getJailConfig(guild.id);
        if (!config) return message.reply('Jail system is not set up in this server.');

        const jailRole = guild.roles.cache.get(config.jail_role_id);
        const jailChannel = guild.channels.cache.get(config.jail_channel_id);

        if (jailRole) {
            const channels = guild.channels.cache.filter(c => c.type === 0 || c.type === 2 || c.type === 4);
            for (const [, channel] of channels) {
                await channel.permissionOverwrites.delete(jailRole).catch(() => {});
            }
            await jailRole.delete('zekbot420 jail unsetup').catch(() => {});
        }

        if (jailChannel) await jailChannel.delete('zekbot420 jail unsetup').catch(() => {});

        await deleteJailConfig(guild.id);
        await message.reply('✅ Jail system has been removed.');
    }
};