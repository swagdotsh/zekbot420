const {
    AttachmentBuilder,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { readMetadata, writeMetadata, formatFor, FIELDS } = require('../../audioMetadata');
const { fetchLimited } = require('../../safeFetch');
const { uploadLimit } = require('../../socialEmbeds');
const { ok, fail, loading } = require('../../ui');

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const SUPPORTED = 'MP3, M4A, AAC, FLAC, OGG, Opus or WAV';

const LABELS = {
    title: 'Title', artist: 'Artist', album: 'Album', albumartist: 'Album artist', genre: 'Genre',
    year: 'Year', track: 'Track', disc: 'Disc', composer: 'Composer', comment: 'Comment',
};
const TAG_FOR_FIELD = Object.fromEntries(Object.entries(FIELDS).map(([field, tag]) => [field, tag]));

function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

function tagValue(tags, field) {
    const tag = TAG_FOR_FIELD[field];
    const value = tags[tag] ?? (field === 'year' ? tags.year : undefined) ?? (field === 'albumartist' ? tags.albumartist ?? tags['album artist'] : undefined);
    return value ? String(value).slice(0, 1024) : null;
}

function metadataEmbed(fileName, meta, title) {
    const fields = Object.keys(LABELS)
        .map((field) => ({ name: LABELS[field], value: tagValue(meta.tags, field), inline: field !== 'comment' }))
        .filter((f) => f.value);

    const advisoryIcon = meta.advisory === 1 || meta.advisory === 4 ? '🅴 ' : meta.advisory === 2 ? '🅲 ' : '';
    const audio = [
        meta.audio.codec,
        meta.audio.sampleRate && `${(meta.audio.sampleRate / 1000).toFixed(1)} kHz`,
        meta.audio.bitsPerSample && `${meta.audio.bitsPerSample}-bit`,
        meta.audio.channels && (meta.audio.channels === 1 ? 'mono' : meta.audio.channels === 2 ? 'stereo' : `${meta.audio.channels} ch`),
        meta.bitrate && `${Math.round(meta.bitrate / 1000)} kbps`,
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle(title ?? `🎵 ${fileName}`)
        .addFields(
            ...(fields.length ? fields : [{ name: 'Tags', value: '*No tags*' }]),
            { name: 'Advisory (ITUNESADVISORY)', value: `${advisoryIcon}${meta.advisoryLabel}`, inline: true },
            { name: 'Length', value: formatDuration(meta.duration), inline: true },
            { name: 'Cover art', value: meta.cover ? 'Yes' : 'None', inline: true },
            { name: 'Audio', value: audio || 'Unknown' },
        );
    return embed;
}

async function downloadAttachment(attachment, maxBytes, kind) {
    if (attachment.size > maxBytes) throw new Error(`That ${kind} is too big (max ${Math.floor(maxBytes / 1024 / 1024)} MB).`);
    return fetchLimited(attachment.url, { maxBytes, timeoutMs: 30000 });
}

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('metadata')
        .setDescription('View or edit the tags on an audio file')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addSubcommand((sub) =>
            sub.setName('view').setDescription('Show the tags, cover art and explicit/clean advisory of an audio file')
                .addAttachmentOption((opt) => opt.setName('file').setDescription(`The audio file (${SUPPORTED})`).setRequired(true)))
        .addSubcommand((sub) => {
            sub.setName('edit').setDescription('Change tags and get the edited file back (empty a tag with "-")')
                .addAttachmentOption((opt) => opt.setName('file').setDescription(`The audio file (${SUPPORTED})`).setRequired(true))
                .addStringOption((opt) =>
                    opt.setName('advisory').setDescription('iTunes explicit/clean advisory (ITUNESADVISORY)')
                        .addChoices({ name: 'Explicit', value: 'explicit' }, { name: 'Clean', value: 'clean' }, { name: 'None', value: 'none' }));
            for (const [field, label] of Object.entries(LABELS)) {
                sub.addStringOption((opt) => opt.setName(field).setDescription(`${label} ("-" to remove)`).setMaxLength(field === 'comment' ? 1000 : 300));
            }
            return sub
                .addAttachmentOption((opt) => opt.setName('cover').setDescription('New cover art image (JPG or PNG)'))
                .addBooleanOption((opt) => opt.setName('remove_cover').setDescription('Remove the cover art'));
        }),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const file = interaction.options.getAttachment('file', true);
        const format = formatFor(file.name);
        if (!format) {
            return interaction.reply({ content: fail(`That isn't a supported audio file. Send an ${SUPPORTED} file.`), flags: MessageFlags.Ephemeral });
        }

        if (sub === 'view') {
            await interaction.deferReply();
            try {
                const buffer = await downloadAttachment(file, MAX_INPUT_BYTES, 'file');
                const meta = await readMetadata(buffer, file.name);
                const embed = metadataEmbed(file.name, meta);
                const files = [];
                if (meta.cover) {
                    files.push(new AttachmentBuilder(meta.cover, { name: 'cover.jpg' }));
                    embed.setThumbnail('attachment://cover.jpg');
                }
                return interaction.editReply({ embeds: [embed], files });
            } catch (error) {
                console.error('[metadata view]', error.message);
                return interaction.editReply(fail(error.message.startsWith('That') ? error.message : 'Couldn\'t read that file. Make sure it\'s a valid audio file.'));
            }
        }

        const changes = {};
        for (const field of Object.keys(LABELS)) {
            const value = interaction.options.getString(field);
            if (value === null) continue;
            changes[field] = value.trim() === '-' ? '' : value.trim();
        }
        const advisory = interaction.options.getString('advisory');
        if (advisory) changes.advisory = advisory;
        const cover = interaction.options.getAttachment('cover');
        if (interaction.options.getBoolean('remove_cover')) changes.removeCover = true;

        if (!Object.keys(changes).length && !cover) {
            return interaction.reply({ content: fail('Pick at least one tag to change.'), flags: MessageFlags.Ephemeral });
        }
        if (cover && !/^image\/(jpeg|png)$/.test(cover.contentType ?? '')) {
            return interaction.reply({ content: fail('The cover has to be a JPG or PNG image.'), flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ content: loading(`Editing **${file.name.replace(/[*_`~|]/g, '')}**...`) });
        try {
            const buffer = await downloadAttachment(file, MAX_INPUT_BYTES, 'file');
            if (cover) changes.cover = await downloadAttachment(cover, MAX_COVER_BYTES, 'cover image');

            const edited = await writeMetadata(buffer, file.name, changes);
            const limit = interaction.guild ? uploadLimit(interaction.guild) : 10 * 1024 * 1024 - 256 * 1024;
            if (edited.buffer.length > limit) {
                return interaction.editReply(fail(`The edited file is ${(edited.buffer.length / 1024 / 1024).toFixed(1)} MB, which is too big to upload here.`));
            }

            const meta = await readMetadata(edited.buffer, edited.fileName);
            const embed = metadataEmbed(edited.fileName, meta, `🎵 ${edited.fileName} (edited)`);
            const files = [new AttachmentBuilder(edited.buffer, { name: edited.fileName })];
            if (meta.cover) {
                files.push(new AttachmentBuilder(meta.cover, { name: 'cover.jpg' }));
                embed.setThumbnail('attachment://cover.jpg');
            }
            const note = edited.fileName !== file.name ? ` Saved as ${edited.fileName} because raw AAC can't hold tags.` : '';
            return interaction.editReply({ content: ok(`Here's your edited file.${note}`), embeds: [embed], files });
        } catch (error) {
            console.error('[metadata edit]', error.message);
            const known = /^(That|Cover art|\.\w+ files|ffmpeg)/.test(error.message);
            return interaction.editReply(fail(known ? error.message : 'Couldn\'t edit that file. Make sure it\'s a valid audio file.'));
        }
    },
};
