const { ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags } = require('discord.js');
const { findMedia } = require('../../shazam');
const { runShazam } = require('./shazam');
const { fail } = require('../../ui');

module.exports = {
    cooldown: 10,
    data: new ContextMenuCommandBuilder()
        .setName('Shazam')
        .setType(ApplicationCommandType.Message)
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        const media = findMedia(interaction.targetMessage);
        if (!media) return interaction.reply({ content: fail('That message has no video or audio file.'), flags: MessageFlags.Ephemeral });
        return runShazam(interaction, media);
    },
};
