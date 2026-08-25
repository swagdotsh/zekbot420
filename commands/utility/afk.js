const { setAfk } = require('./../../events/afkStore');

module.exports = {
    name: 'afk',
    aliases: ['away', 'awayfromkeyboard'],
    description: 'Set yourself as AFK',
    async execute(message, args) {
        const reason = args.join(' ').trim() || 'No reason provided.';
        const startedAt = Date.now();

        setAfk(message.guild.id, message.author.id, {
            reason,
            startedAt,
        });

        await message.reply({
            content: `Your AFK has been set to ${reason}.`,
            allowedMentions: {
                repliedUser: false,
            },
        });
    },
};