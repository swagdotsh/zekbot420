module.exports = {
    name: 'loop',
    aliases: ['repeat'],
    async execute(message, args) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('There is no active player right now.');

        const input = (args[0] || '').toLowerCase();

        if (!input) {
            return message.reply("Loop mode is currently `"+session.loopMode || 'off'+"`.\nUsage: `,loop off|track|queue`");
        }

        const valid = ['off', 'track', 'queue'];
        if (!valid.includes(input)) {
            return message.reply('Invalid loop mode. Use `off`, `track`, or `queue`.');
        }

        session.loopMode = input;
        return message.reply(`Loop mode set to \`${input}\`.`);
    }
};