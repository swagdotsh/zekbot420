const { PermissionFlagsBits } = require('discord.js');
const { updateConfig } = require('../../starboardHandler');

module.exports = {
    name: 'starboardthreshold',
    aliases: ['starthreshold', 'starthres'],

    async execute(message, args) {
        if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('You need the `Manage Server` permission to configure the starboard. <:smirk2:1498272372539785286>');
        }

        const threshold = Number(args[0]);
        if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
            return message.reply('Provide a whole-number threshold from 1 to 1000. Example: `,starboardthreshold 3`');
        }

        await updateConfig(message.guild.id, (config) => {
            config.threshold = threshold;
        });

        return message.reply(`Starboard threshold set to ${threshold} star${threshold === 1 ? '' : 's'}.`);
    },
};
