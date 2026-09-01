const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const {
    AttachmentBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');

const MAX_EMOJI_SIZE = 256 * 1024;
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024;

function isValidEmojiName(name) {
    return /^[a-zA-Z0-9_]{2,32}$/.test(name);
}

function isImageUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function getExtensionFromUrl(url) {
    try {
        const parsed = new URL(url);
        const ext = path.extname(parsed.pathname).toLowerCase();

        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
            return ext;
        }
    } catch {
        // ignored
    }

    return '.img';
}

async function downloadFile(url, outputPath) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download file. HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_DOWNLOAD_SIZE) {
        throw new Error('That file is too large to download.');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_DOWNLOAD_SIZE) {
        throw new Error('That file is too large to download.');
    }

    await fs.writeFile(outputPath, buffer);
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args, {
            stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderr = '';

        ffmpeg.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        ffmpeg.on('error', reject);

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(stderr || `ffmpeg exited with code ${code}`));
            }
        });
    });
}

async function compressStaticEmoji(inputPath, outputPath) {
    await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vf',
        'scale=128:128:force_original_aspect_ratio=decrease,pad=128:128:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-frames:v',
        '1',
        '-compression_level',
        '9',
        outputPath,
    ]);
}

async function compressAnimatedEmoji(inputPath, outputPath) {
    await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vf',
        'fps=15,scale=128:128:force_original_aspect_ratio=decrease:flags=lanczos,pad=128:128:(ow-iw)/2:(oh-ih)/2:color=0x00000000,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
        '-loop',
        '0',
        outputPath,
    ]);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addemoji')
        .setDescription('Add an emoji to the server from a link or attachment')
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription('The emoji name')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('url')
                .setDescription('A direct image/gif URL')
                .setRequired(false)
        )
        .addAttachmentOption((option) =>
            option
                .setName('file')
                .setDescription('An image/gif file to use as the emoji')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true,
            });
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
            return interaction.reply({
                content: 'You need the **Create Expressions** or **Manage Expressions** permission to use this. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
            return interaction.reply({
                content: 'I need the **Create Expressions** or **Manage Expressions** permission to add emojis. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const emojiName = interaction.options.getString('name', true);
        const urlArg = interaction.options.getString('url');
        const attachment = interaction.options.getAttachment('file');

        if (!isValidEmojiName(emojiName)) {
            return interaction.reply({
                content: 'Emoji names must be 2-32 characters and can only contain letters, numbers, and underscores.',
                ephemeral: true,
            });
        }

        const fileUrl = attachment?.url || urlArg;

        if (!fileUrl || !isImageUrl(fileUrl)) {
            return interaction.reply({
                content: 'Please provide a valid image/gif URL or attach a file.',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zekbot-emoji-'));
        const inputExt = attachment?.name ? path.extname(attachment.name).toLowerCase() || '.img' : getExtensionFromUrl(fileUrl);
        const inputPath = path.join(tempDir, `input${inputExt}`);
        const isAnimated = inputExt === '.gif' || attachment?.contentType === 'image/gif';
        const outputExt = isAnimated ? '.gif' : '.png';
        const outputPath = path.join(tempDir, `emoji${outputExt}`);

        try {
            await downloadFile(fileUrl, inputPath);

            if (isAnimated) {
                await compressAnimatedEmoji(inputPath, outputPath);
            } else {
                await compressStaticEmoji(inputPath, outputPath);
            }

            const stats = await fs.stat(outputPath);

            if (stats.size > MAX_EMOJI_SIZE) {
                const failedAttachment = new AttachmentBuilder(outputPath, {
                    name: `compressed-too-large${outputExt}`,
                });

                return interaction.editReply({
                    content:
                        `I compressed it, but it is still too large for a Discord emoji.\n` +
                        `Final size: \`${Math.ceil(stats.size / 1024)} KB\`\n` +
                        `Discord emoji limit: \`256 KB\``,
                    files: [failedAttachment],
                });
            }

            const createdEmoji = await interaction.guild.emojis.create({
                attachment: outputPath,
                name: emojiName,
            });

            return interaction.editReply(`Added emoji: ${createdEmoji} \`:${createdEmoji.name}:\``);
        } catch (error) {
            console.error(error);

            return interaction.editReply(
                'Failed to add that emoji. Make sure the file is a valid image/gif and that I have permission to create emojis. <:smirk2:1498272372539785286>'
            );
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
        }
    },
};
