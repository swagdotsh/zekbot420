module.exports = {
    name: 'poll',
    aliases: ['vote', 'p'],
    async execute(message, args) {
        const pollQuestion = args.join(' ').trim();
        if (!pollQuestion) {
            return message.reply({
                content: 'Usage: `,poll <question>`\nExample: `,poll should i go for a walk today`'
            });
        }

        try {
            await message.react('👍');
            await message.react('👎');
        } catch (err) {
            console.error('Failed to add poll reactions:', err);
            return message.reply({
                content: 'I couldn’t add reactions to your message. Check my permissions (Add Reactions + Read Message History).'
            });
        }

    }
};