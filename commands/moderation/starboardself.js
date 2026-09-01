const { PermissionFlagsBits } = require('discord.js');
const { updateConfig } = require('../../starboardHandler');

module.exports = {
    name: 'starboardself',
    aliases: ['starself'],

    async execute(message, args) {
        if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('You need the `Manage Server` permission to configure the starboard.');
        }

        const value = args[0]?.toLowerCase();
        if (!['yes', 'no'].includes(value)) {
            return message.reply('Choose `yes` or `no`. Example: `,starboardself yes`');
        }

        const allowSelf = value === 'yes';
        await updateConfig(message.guild.id, (config) => {
            config.allowSelf = allowSelf;
        });

        return message.reply(`Self-stars are now ${allowSelf ? 'allowed' : 'not counted'} for the starboard.`);
    },
};
