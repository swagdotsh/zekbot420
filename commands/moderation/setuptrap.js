const { PermissionsBitField } = require('discord.js');
const { createTrapChannel, readGuildConfig, writeGuildConfig } = require('../../events/trapHelper');

function extractRoleIds(message) {
    const roleIds = new Set();

    for (const role of message.mentions.roles.values()) {
        roleIds.add(role.id);
    }

    const rawIds = message.content.match(/\b\d{17,20}\b/g) ?? [];
    for (const id of rawIds) {
        if (message.guild.roles.cache.has(id)) roleIds.add(id);
    }

    return [...roleIds];
}

module.exports = {
    name: 'setuptrap',
    aliases: ['strap'],
    description: 'Creates a hidden-in-plain-sight trap channel for compromised account detection.',
    async execute(message, args) {
        if (
            !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
            !message.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
            message.author.id !== message.guild.ownerId
        ) {
            return message.reply('You need Manage Server permission to run this command.');
        }

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('I need Manage Channels permission to create the trap channel.');
        }

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('I need Ban Members permission before the trap system can be enabled.');
        }

        const config = await readGuildConfig(message.guild.id);

        if (config.trapChannelId && message.guild.channels.cache.has(config.trapChannelId)) {
            return message.reply(`A trap channel is already configured: <#${config.trapChannelId}>`);
        }

        const mentionedRoleIds = extractRoleIds(message);
        if (mentionedRoleIds.length) {
            config.trapExemptRoleIds = [...new Set([...(config.trapExemptRoleIds ?? []), ...mentionedRoleIds])];
            await writeGuildConfig(message.guild.id, config);
        }

        const nameArgs = args.filter(arg => !arg.match(/^<@&\d+>$/) && !message.guild.roles.cache.has(arg));
        const requestedName = nameArgs.join(' ');

        const channel = await createTrapChannel(message, requestedName);

        await message.reply(
            `Trap channel created: ${channel}\n` +
            `Staff exemptions: ${
                config.trapExemptRoleIds?.length
                    ? config.trapExemptRoleIds.map(roleId => `<@&${roleId}>`).join(', ')
                    : 'none configured'
            }\n\n` +
            'Any non-bot, non-webhook, non-exempt user posting there will be banned automatically.'
        );
    },
};