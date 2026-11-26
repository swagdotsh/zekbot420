const { currentPrefix } = require('../../prefix');
const { parseWhen, createReminder, formatDue } = require('../../reminders');

module.exports = {
    name: 'settimer',
    aliases: ['timer', 'st'],

    async execute(message, args) {
        if (!args.length) {
            return message.reply(`Usage: \`${currentPrefix()}settimer <10m | 2h | 3d> [reason]\``);
        }

        const when = parseWhen(args[0]);
        if (when.error) return message.reply(when.error);

        const result = await createReminder({
            userId: message.author.id,
            guildId: message.guild?.id,
            channelId: message.channel.id,
            kind: 'timer',
            reason: args.slice(1).join(' '),
            dueAt: when.dueAt,
        });
        if (result.error) return message.reply(result.error);

        return message.reply(`⏳ Timer set, it finishes ${formatDue(result.dueAt)}.`);
    }
};
