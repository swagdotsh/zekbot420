const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const MAX_DURATION = 240;
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const TARGET_SIZE_MB = 7;
const TEMP_DIR = path.join(__dirname, '..', '..', 'data', 'downloads');

async function getDuration(url) {
    const { stdout } = await execFileAsync(YTDLP_BIN, [
        '--no-playlist',
        '--print', '%(duration)s',
        url
    ]);

    return parseFloat(stdout.trim());
}

async function download(url, outputPath) {
    await execFileAsync(YTDLP_BIN, [
        '--no-playlist',
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--output', outputPath,
        url
    ]);
}

async function compress(inputPath, outputPath, durationSec) {
    const audioBitrate = 96;
    const targetBits = TARGET_SIZE_MB * 8 * 1024 * 1024;
    const videoBitrate = Math.floor(targetBits / durationSec / 1000) - audioBitrate;

    await execFileAsync(FFMPEG_BIN, [
        '-i', inputPath,
        '-b:v', `${videoBitrate}k`,
        '-b:a', `${audioBitrate}k`,
        '-bufsize', `${videoBitrate * 2}k`,
        '-y',
        outputPath
    ]);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('Download a video from a URL')
        .addStringOption((opt) =>
            opt
                .setName('url')
                .setDescription('The video URL to download')
                .setRequired(true)
        )
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        await interaction.deferReply();

        const url = interaction.options.getString('url', true);

        fs.mkdirSync(TEMP_DIR, { recursive: true });

        const id = Date.now();
        const start = Date.now();
        const rawPath = path.join(TEMP_DIR, `${id}_raw.mp4`);
        const compressedPath = path.join(TEMP_DIR, `${id}_compressed.mp4`);

        const cleanup = () => {
            for (const p of [rawPath, compressedPath]) {
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
        };

        try {
            const duration = await getDuration(url);

            if (isNaN(duration)) {
                cleanup();
                return interaction.editReply('Couldn\'t read that URL. <:smirk2:1498272372539785286>');
            }

            if (duration > MAX_DURATION) {
                cleanup();
                return interaction.editReply(
                    `Sorry, your video is too long (${Math.round(duration)}s). Max is ${MAX_DURATION}s. <:smirk2:1498272372539785286>`
                );
            }

            await download(url, rawPath);

            const rawSize = fs.statSync(rawPath).size;
            let finalPath = rawPath;

            if (rawSize > MAX_SIZE_BYTES) {
                await compress(rawPath, compressedPath, duration);

                const compressedSize = fs.statSync(compressedPath).size;

                if (compressedSize > MAX_SIZE_BYTES) {
                    cleanup();
                    return interaction.editReply('Your video was too large, even after compression. Sorry! <:smirk2:1498272372539785286>');
                }

                finalPath = compressedPath;
            }

            const elapsed = Date.now() - start;

            await interaction.editReply({
                content: `✅ Done! \n-# Downloaded in ${elapsed}ms`,
                files: [finalPath]
            });

            cleanup();
        } catch (err) {
            console.error('Download command failed:', err);
            cleanup();

            return interaction.editReply('Something went wrong. <:smirk2:1498272372539785286>');
        }
    }
};