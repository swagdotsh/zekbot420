const { PermissionFlagsBits } = require('discord.js');
const { postPanel } = require('../../ticketHandler');

const SMIRK = '<:smirk2:1498272372539785286>';

module.exports = {
    name: 'ticketpanel',
    aliases: ['tpanel'],
    async execute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply(`You need the **Manage Server** permission to post the ticket panel. ${SMIRK}`);
        }

        const channel = message.mentions.channels.find(c => c.guildId === message.guild.id) ?? message.channel;

        try {
            const result = await postPanel(channel);
            if (result.error) return message.reply(result.error);
            if (channel.id !== message.channel.id) return message.reply(`Posted the ticket panel in ${channel}.`);
        } catch (err) {
            console.error('ticketpanel failed:', err);
            return message.reply(`Couldn't post the ticket panel. ${SMIRK}`);
        }
    },
};
