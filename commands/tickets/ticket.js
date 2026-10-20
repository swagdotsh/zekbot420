const { getOpenTicketByChannel, getTicketConfig, isStaff, claimTicket, closeTicket, setTicketAccess } = require('../../ticketHandler');

const SMIRK = '<:smirk2:1498272372539785286>';

function usage() {
    const p = process.env.PREFIX;
    return `Usage (inside a ticket): \`${p}ticket add @user\` • \`${p}ticket remove @user\` • \`${p}ticket rename <name>\` • \`${p}ticket claim\` • \`${p}ticket close [reason]\``;
}

module.exports = {
    name: 'ticket',
    aliases: ['t'],
    async execute(message, args) {
        const action = args[0]?.toLowerCase();
        if (!['add', 'remove', 'rename', 'claim', 'close'].includes(action)) return message.reply(usage());

        const ticket = await getOpenTicketByChannel(message.channel.id);
        if (!ticket) return message.reply(`This isn't an open ticket channel. ${SMIRK}`);

        const config = await getTicketConfig(message.guild.id);
        const staff = config ? isStaff(message.member, config) : false;

        try {
            if (action === 'close') {
                if (message.author.id !== ticket.opener_id && !staff) return message.reply('Only the person who opened this ticket or staff can close it.');
                const result = await closeTicket(message.client, ticket, message.author, args.slice(1).join(' ').trim());
                if (result.error) return message.reply(result.error);
                return;
            }

            if (!staff) return message.reply(`Only staff can do that. ${SMIRK}`);

            if (action === 'claim') {
                const result = await claimTicket(message.guild, ticket, message.member);
                return message.reply(result.error ?? `🙋 **${message.member.displayName}** claimed this ticket.`);
            }

            if (action === 'rename') {
                const name = args.slice(1).join('-').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 90);
                if (!name) return message.reply(usage());
                await message.channel.setName(name, `Renamed by ${message.author.tag}`);
                return message.reply(`Renamed this ticket to **${name}**.`);
            }

            const user = message.mentions.users.first();
            if (!user) return message.reply(usage());

            const result = await setTicketAccess(message.channel, ticket, user, action === 'add');
            if (result.error) return message.reply(result.error);
            return message.reply(action === 'add' ? `Added ${user} to this ticket.` : `Removed **${user.tag}** from this ticket.`);
        } catch (err) {
            console.error(`,ticket ${action} failed:`, err);
            return message.reply(`Something went wrong. ${SMIRK}`);
        }
    },
};
