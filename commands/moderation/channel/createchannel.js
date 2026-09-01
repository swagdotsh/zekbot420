const {
    ChannelType,
    PermissionFlagsBits,
    PermissionsBitField,
} = require('discord.js');

function cleanRoleId(input) {
    return input?.replace(/[<@&>]/g, '');
}

module.exports = {
    name: 'channel',
    aliases: ['createchannel', 'cc'],

    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('You need the `Manage Channels` permission to use this command. <:smirk2:1498272372539785286>');
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('I need the `Manage Channels` permission to create channels. <:smirk2:1498272372539785286>');
        }

        if (!args.length) {
            return message.reply(
                `Usage: \`${process.env.PREFIX || ','}channel [channel-name] [optional category ID] [optional role mention/id/name]\``
            );
        }

        const channelName = args[0];
        let category = null;
        let role = null;

        const possibleCategoryId = args[1];

        if (possibleCategoryId) {
            const foundCategory = message.guild.channels.cache.get(possibleCategoryId);

            if (foundCategory?.type === ChannelType.GuildCategory) {
                category = foundCategory;
                const roleInput = args.slice(2).join(' ');

                if (roleInput) {
                    const roleId = cleanRoleId(roleInput);

                    role =
                        message.guild.roles.cache.get(roleId) ||
                        message.guild.roles.cache.find(r => r.name.toLowerCase() === roleInput.toLowerCase());
                }
            } else {
                const roleInput = args.slice(1).join(' ');
                const roleId = cleanRoleId(roleInput);

                role =
                    message.guild.roles.cache.get(roleId) ||
                    message.guild.roles.cache.find(r => r.name.toLowerCase() === roleInput.toLowerCase());
            }
        }

        if (args[1] && !category && !role) {
            return message.reply('I could not find that category or role.');
        }

        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
        };

        if (category) {
            channelOptions.parent = category.id;
        }

        if (role) {
            channelOptions.permissionOverwrites = [
                {
                    id: message.guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: role.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                },
                {
                    id: message.guild.members.me.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                },
            ];
        }

        try {
            const channel = await message.guild.channels.create(channelOptions);

            return message.reply(
                `✅ Created ${channel}${category ? ` in **${category.name}**` : ''}${role ? ` and made it private for ${role}` : ''}.`
            );
        } catch (error) {
            console.error(error);
            return message.reply('Failed to create the channel.');
        }
    },
};
