const { setJailConfig, getJailConfig } = require('../../../jailHandler');

module.exports = {
    name: 'setupjail',
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need the **Manage Server** permission to run this. <:smirk2:1498272372539785286>');
        }

        const guild = message.guild;
        const existingConfig = await getJailConfig(guild.id);

        if (existingConfig) {
            return message.reply(
                'Jail is already configured. Use `,jail @user <duration>`, `,unjail @user`, or `,unsetupjail` to manage it. <:smirk2:1498272372539785286>'
            );
        }

        let jailRole = guild.roles.cache.find(r => r.name === 'Jailed');
        if (!jailRole) {
            jailRole = await guild.roles.create({
                name: 'Jailed',
                color: 0x808080,
                reason: 'zekbot420 jail setup'
            });
        }

        let jailChannel = guild.channels.cache.find(c => c.name === 'jail');
        if (!jailChannel) {
            jailChannel = await guild.channels.create({
                name: 'jail',
                type: 0,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: ['ViewChannel']
                    },
                    {
                        id: jailRole.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        deny: ['AddReactions', 'AttachFiles', 'EmbedLinks']
                    }
                ],
                reason: 'zekbot420 jail setup'
            });
        }

        const channels = guild.channels.cache.filter(c => c.id !== jailChannel.id && (c.type === 0 || c.type === 2 || c.type === 4));
        for (const [, channel] of channels) {
            await channel.permissionOverwrites.edit(jailRole, { ViewChannel: false }).catch(() => {});
        }

        await setJailConfig(guild.id, jailChannel.id, jailRole.id);

        await message.reply({
            embeds: [{
                color: 0x5865f2,
                title: '🔒 Jail Setup Complete',
                fields: [
                    { name: 'Jail Channel', value: `<#${jailChannel.id}>`, inline: true },
                    { name: 'Jail Role', value: `<@&${jailRole.id}>`, inline: true },
                    { name: 'Channels Restricted', value: `${channels.size}`, inline: true }
                ]
            }]
        });
    }
};
