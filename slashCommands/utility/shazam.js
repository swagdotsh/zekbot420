const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { recognizeUrl, findMedia, isMediaAttachment, buildReply, errorMessage } = require('../../shazam');
const { fail, loading } = require('../../ui');

const MESSAGE_LINK = /discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/;

async function mediaFromLink(interaction, link) {
    const match = link.match(MESSAGE_LINK);
    if (match) {
        const channel = await interaction.client.channels.fetch(match[2]).catch(() => null);
        if (!channel?.isTextBased() || (channel.guild && !channel.permissionsFor(interaction.user)?.has('ViewChannel'))) return null;
        const message = await channel.messages.fetch(match[3]).catch(() => null);
        return findMedia(message);
    }
    try {
        const url = new URL(link);
        return ['http:', 'https:'].includes(url.protocol) ? { url: url.href, name: url.pathname } : null;
    } catch {
        return null;
    }
}

async function runShazam(interaction, media) {
    await interaction.reply({ content: loading('Listening...') });
    try {
        const result = await recognizeUrl(media.url);
        if (!result) return interaction.editReply(fail('I couldn\'t recognise that song. Try a clip where the music is clearer.'));
        return interaction.editReply({ content: '', ...(await buildReply(result)) });
    } catch (error) {
        if (error.message !== 'NO_AUDIO') console.error('[shazam]', error.message);
        return interaction.editReply(fail(errorMessage(error)));
    }
}

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('shazam')
        .setDescription('Find the song playing in a video or audio file')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addAttachmentOption((opt) => opt.setName('file').setDescription('A video or audio file'))
        .addStringOption((opt) => opt.setName('link').setDescription('A link to a Discord message with a video, or to a media file')),

    async execute(interaction) {
        const file = interaction.options.getAttachment('file');
        const link = interaction.options.getString('link');

        let media = null;
        if (file) {
            if (!isMediaAttachment(file)) return interaction.reply({ content: fail('That file isn\'t a video or audio file.'), flags: MessageFlags.Ephemeral });
            media = { url: file.url, name: file.name };
        } else if (link) {
            media = await mediaFromLink(interaction, link.trim());
            if (!media) return interaction.reply({ content: fail('I couldn\'t find a video or audio file at that link.'), flags: MessageFlags.Ephemeral });
        } else {
            return interaction.reply({
                content: fail('Upload a file, give a link, or right-click a message with a video and choose **Apps > Shazam**.'),
                flags: MessageFlags.Ephemeral,
            });
        }
        return runShazam(interaction, media);
    },

    runShazam,
};
