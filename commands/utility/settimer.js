module.exports = {
    name: 'settimer',
    aliases: ['timer', 'st'],

    async execute(message, args) {
        if (!args.length) {
            return message.reply('Usage: ,settimer [time e.g. 10m, 2h, 3d] [reason]');
        }

        const timeArg = args[0].toLowerCase();
        const reason = args.slice(1).join(' ') || 'No reason provided';

        const match = timeArg.match(/^(\d+)([mhd]?)$/);

        if (!match) {
            return message.reply('Invalid time format. Use 10m, 2h, 3d, or just a number (minutes)');
        }

        let value = parseInt(match[1]);
        let unit = match[2] || 'm';

        let ms;

        if (unit === 'm') ms = value * 60 * 1000;
        else if (unit === 'h') ms = value * 60 * 60 * 1000;
        else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;

        if (ms > 2147483647) {
            return message.reply('Timer is too long (max ~24 days)');
        }

        if (ms <= 0) {
            return message.reply('Time must be greater than 0');
        }

        message.reply(`⏳ Timer set for ${timeArg}`);

        setTimeout(() => {
            message.author.send(`⏰ Timer finished: ${reason}`);
        }, ms);
    }
};