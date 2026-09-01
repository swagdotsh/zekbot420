const { readGuildConfig } = require('../../events/trapHelper');

module.exports = {
    name: 'trapstats',
    aliases: ['traps'],
    description: 'Shows trap channel ban stats for this server.',
    async execute(message) {
        const config = await readGuildConfig(message.guild.id);

        return message.reply(
            `Trap channel: ${config.trapChannelId ? `<#${config.trapChannelId}>` : 'not configured'}\n` +
            `Trap bans: ${Number.isInteger(config.trapBanCount) ? config.trapBanCount : 0}`
        );
    },
};