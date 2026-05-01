module.exports = {
    name: 'remindme',
    aliases: ['remind'],

    async execute(message, args) {
        if (!args.length) {
            return message.reply('Usage: ,remindme MM-DD-YYYY [reason]');
        }

        const dateArg = args[0];
        const reason = args.slice(1).join(' ') || 'No reason provided';

        const [month, day, year] = dateArg.split('-').map(Number);

        if (!month || !day || !year) {
            return message.reply('Invalid date format. Use MM-DD-YYYY');
        }

        const targetDate = new Date(year, month - 1, day);

        if (isNaN(targetDate.getTime())) {
            return message.reply('Invalid date.');
        }

        const now = new Date();

        if (targetDate <= now) {
            return message.reply('That date is in the past.');
        }

        const delay = targetDate.getTime() - now.getTime();

        if (delay > 2147483647) {
            return message.reply('That reminder is too far in the future.');
        }

        message.reply(`Reminder set for ${dateArg}`);

        setTimeout(() => {
            message.author.send(`⏰ Reminder: ${reason}`);
        }, delay);
    }
};