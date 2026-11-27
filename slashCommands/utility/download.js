const { SlashCommandBuilder, MessageFlags, InteractionContextType, AttachmentBuilder } = require('discord.js');
const { isEnabled, downloadVideo, DownloadError, MAX_DURATION } = require('../../downloads');
const { loading, ok, fail } = require('../../ui');

module.exports = {
    cooldown: 15,
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription(`Download a video (up to ${MAX_DURATION / 60} minutes) from a link`)
        .addStringOption((opt) =>
            opt.setName('url').setDescription('The video link').setRequired(true)
        )
        .setIntegrationTypes(0)
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        if (!(await isEnabled(interaction.guildId))) {
            return interaction.reply({
                content: fail('Downloads are off in this server. Someone with Manage Server can turn them on with `/setup downloads` or on the dashboard.'),
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();
        const start = Date.now();
        try {
            const result = await downloadVideo(
                interaction.options.getString('url', true),
                interaction.guild,
                (text) => interaction.editReply(loading(text)).catch(() => {}),
            );
            return interaction.editReply({
                content: ok(`Done!\n-# Downloaded in ${((Date.now() - start) / 1000).toFixed(1)}s${result.compressed ? ', compressed to fit' : ''}`),
                files: [new AttachmentBuilder(result.buffer, { name: 'video.mp4' })],
            });
        } catch (error) {
            if (!(error instanceof DownloadError)) console.error('Download command failed:', error);
            return interaction.editReply(fail(error instanceof DownloadError ? error.message : 'Something went wrong downloading that.')).catch(() => {});
        }
    },
};
