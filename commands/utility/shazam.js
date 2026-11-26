const { recognizeUrl, findMedia, buildReply, errorMessage } = require('../../shazam');
const { fail, loading } = require('../../ui');

module.exports = {
    name: 'shazam',
    aliases: ['sz', 'whatsong'],
    cooldown: 10,
    async execute(message) {
        let media = findMedia(message);
        if (!media && message.reference?.messageId) {
            const replied = await message.fetchReference().catch(() => null);
            media = findMedia(replied);
        }
        if (!media) {
            return message.reply(fail('Attach a video or audio file, or reply to a message that has one.'));
        }

        const status = await message.reply({ content: loading('Listening...'), allowedMentions: { repliedUser: false } });
        try {
            const result = await recognizeUrl(media.url);
            if (!result) return status.edit(fail('I couldn\'t recognise that song. Try a clip where the music is clearer.'));
            return status.edit({ content: '', ...(await buildReply(result)) });
        } catch (error) {
            if (error.message !== 'NO_AUDIO') console.error('[shazam]', error.message);
            return status.edit(fail(errorMessage(error)));
        }
    },
};
