const { AttachmentBuilder } = require('discord.js');
const { currentPrefix } = require('../../prefix');
const { isEnabled, downloadVideo, DownloadError } = require('../../downloads');
const { loading, ok, fail } = require('../../ui');

module.exports = {
    name: 'download',
    aliases: ['d'],
    cooldown: 15,
    async execute(message, args) {
        if (!message.guild) return message.reply(fail('Downloads only work in servers.'));
        if (!(await isEnabled(message.guild.id))) {
            return message.reply(fail('Downloads are off in this server. Someone with Manage Server can turn them on with `/setup downloads` or on the dashboard.'));
        }
        if (!args[0]) return message.reply(fail(`Give me a link, like \`${currentPrefix()}download <url>\`.`));

        const status = await message.reply(loading('Downloading, give me *oneeeee* second...'));
        const start = Date.now();
        try {
            const result = await downloadVideo(args[0], message.guild, (text) => status.edit(loading(text)).catch(() => {}));
            await status.edit({
                content: ok(`Done!\n-# Downloaded in ${((Date.now() - start) / 1000).toFixed(1)}s${result.compressed ? ', compressed to fit' : ''}`),
                files: [new AttachmentBuilder(result.buffer, { name: 'video.mp4' })],
            });
        } catch (error) {
            if (!(error instanceof DownloadError)) console.error('Download command failed:', error);
            await status.edit(fail(error instanceof DownloadError ? error.message : 'Something went wrong downloading that.')).catch(() => {});
        }
    },
};
