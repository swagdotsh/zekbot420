const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { setupTickets, deleteTicketConfig } = require('../../ticketHandler');

const SMIRK = '<:smirk2:1498272372539785286>';

module.exports = {
    name: 'ticketsetup',
    aliases: ['setuptickets', 'tsetup'],
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply(`You need the **Manage Server** permission to set up tickets. ${SMIRK}`);
        }

        const p = process.env.PREFIX;

        if (['off', 'disable', 'remove'].includes(args[0]?.toLowerCase())) {
            const removed = await deleteTicketConfig(message.guild.id);
            return message.reply(removed
                ? 'Tickets are turned off. Open tickets stay until they are closed, and the panel button stops working.'
                : 'Tickets were not set up on this server.');
        }

        const roleIds = [...message.mentions.roles.keys()];
        if (!roleIds.length) {
            return message.reply(
                `Usage: \`${p}ticketsetup @SupportRole [@MoreRoles] [category ID] [#log-channel]\`\n` +
                `-# You can leave the category and log channel empty and it'll be automatically created. When you're done, run \`${p}ticketpanel #channel\` to post the button`
            );
        }

        const categoryId = args.find(arg => message.guild.channels.cache.get(arg)?.type === ChannelType.GuildCategory) ?? null;
        const logChannel = message.mentions.channels.find(c => c.guildId === message.guild.id && c.type !== ChannelType.GuildCategory);

        const loading = await message.reply('Setting up tickets...');
        try {
            const result = await setupTickets(message.guild, {
                categoryId,
                logChannelId: logChannel?.id ?? null,
                supportRoleIds: roleIds,
                setupBy: message.author.tag,
            });
            if (result.error) return loading.edit(result.error);

            return loading.edit(
                `✅ Tickets are set up!\n` +
                `**Category:** ${result.category.name}${result.createdCategory ? ' (created)' : ''}\n` +
                `**Transcripts:** ${result.logChannel}${result.createdLog ? ' (created)' : ''}\n` +
                `**Support roles:** ${result.roles.map(role => role.toString()).join(', ')}\n` +
                `-# Now post the button with \`${p}ticketpanel #channel\`.`
            );
        } catch (err) {
            console.error('ticketsetup failed:', err);
            return loading.edit(`Something went wrong setting up tickets. ${SMIRK}`);
        }
    },
};
