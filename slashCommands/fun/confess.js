const { InteractionContextType, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { postConfession } = require('../../confessions');
const { fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Post an anonymous confession')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addStringOption((opt) =>
            opt.setName('confession').setDescription('What you want to confess (nobody will see your name)').setRequired(true).setMaxLength(2000))
        .addAttachmentOption((opt) =>
            opt.setName('image').setDescription('Optional image to include')),

    async execute(interaction) {
        const text = interaction.options.getString('confession', true).trim();
        const image = interaction.options.getAttachment('image');
        if (image && !image.contentType?.startsWith('image/')) {
            return interaction.reply({ content: fail('The attachment has to be an image.'), flags: MessageFlags.Ephemeral });
        }
        return postConfession(interaction, text, image);
    },
};
