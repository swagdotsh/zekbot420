const { currentPrefix } = require('../../prefix');
const { parseWhen, createReminder, formatDue } = require('../../reminders');

module.exports = {
    name: 'remindme',
    aliases: ['remind'],

    async execute(message, args) {
        if (!args.length) {
            return message.reply(`Usage: \`${currentPrefix()}remindme <10m | 2h30m | 3d | MM-DD-YYYY> [reason]\``);
        }

        const when = parseWhen(args[0]);
        if (when.error) return message.reply(when.error);

        const result = await createReminder({
            userId: message.author.id,
            guildId: message.guild?.id,
            channelId: message.channel.id,
            kind: 'reminder',
            reason: args.slice(1).join(' '),
            dueAt: when.dueAt,
        });
        if (result.error) return message.reply(result.error);

        return message.reply(`⏰ I'll remind you ${formatDue(result.dueAt)}.`);
    }
};
