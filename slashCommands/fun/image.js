const { AttachmentBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const media = require('../../esmbotMedia');
const { fail, loading } = require('../../ui');

const LOOKBACK_MESSAGES = 30;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;
const DEFAULT_UPLOAD_LIMIT = 10 * 1024 * 1024;

function effectLabel(name) {
    const e = media.EFFECTS[name];
    const needs = [e.text === 'required' && (e.textHint ? `text: ${e.textHint}` : 'text'), e.amount && `amount: ${e.amount}`]
        .filter(Boolean).join(', ');
    return `${name} · ${e.desc}${needs ? ` (${needs})` : ''}`.slice(0, 100);
}

function uploadLimit(interaction) {
    const boostedMb = { 2: 50, 3: 100 }[interaction.guild?.premiumTier ?? 0];
    return boostedMb ? boostedMb * 1024 * 1024 : DEFAULT_UPLOAD_LIMIT;
}

async function findImage(interaction) {
    const attachment = interaction.options.getAttachment('image');
    if (attachment) return attachment.url;

    const link = interaction.options.getString('link')?.trim();
    if (link) {
        if (!/^https?:\/\//i.test(link)) throw Object.assign(new Error('The link has to start with http:// or https://.'), { userFacing: true });
        return link;
    }

    const channel = interaction.channel;
    if (!channel?.messages || (interaction.inGuild() && !interaction.appPermissions?.has('ReadMessageHistory'))) return null;
    const messages = await channel.messages.fetch({ limit: LOOKBACK_MESSAGES }).catch(() => null);
    for (const message of messages?.values() ?? []) {
        const file = message.attachments.find((a) => a.contentType?.startsWith('image/') || IMAGE_EXT.test(a.name ?? ''));
        if (file) return file.url;
        const embedImage = message.embeds.map((e) => e.image?.url ?? e.thumbnail?.url).find(Boolean);
        if (embedImage) return embedImage;
        const sticker = message.stickers.find((s) => s.format !== 3);
        if (sticker) return sticker.url;
    }
    return null;
}

module.exports = {
    cooldown: 8,
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('Edit an image with one of many effects (powered by esmBot)')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addStringOption((opt) => opt.setName('effect').setDescription('The effect to apply').setRequired(true).setAutocomplete(true))
        .addAttachmentOption((opt) => opt.setName('image').setDescription('The image to edit (default: the latest image in the channel)'))
        .addStringOption((opt) => opt.setName('link').setDescription('Or: a link to the image').setMaxLength(1000))
        .addStringOption((opt) => opt.setName('text').setDescription('Text for caption, meme, motivate... (use a comma to split top/bottom)').setMaxLength(500))
        .addNumberOption((opt) => opt.setName('amount').setDescription('Number some effects use (shown next to the effect name)'))
        .addStringOption((opt) => opt.setName('font').setDescription('Font for text effects')
            .addChoices(...media.FONTS.map((f) => ({ name: f, value: f }))))
        .addBooleanOption((opt) => opt.setName('option').setDescription('Extra switch some effects have (e.g. snow globe, caption on top)'))
        .addBooleanOption((opt) => opt.setName('gif').setDescription('Output a GIF')),

    async autocomplete(interaction) {
        const query = interaction.options.getFocused().toLowerCase().trim();
        const names = media.isAvailable() ? media.availableEffects() : Object.keys(media.EFFECTS);
        const matches = names
            .filter((name) => !query || name.includes(query) || media.EFFECTS[name].desc.toLowerCase().includes(query))
            .sort((a, b) => Number(!a.startsWith(query)) - Number(!b.startsWith(query)) || a.localeCompare(b))
            .slice(0, 25)
            .map((name) => ({ name: effectLabel(name), value: name }));
        await interaction.respond(matches).catch(() => {});
    },

    async execute(interaction) {
        const effectName = interaction.options.getString('effect', true).toLowerCase().split(' ')[0];
        const effect = media.EFFECTS[effectName];
        if (!effect) return interaction.reply({ content: fail('Pick an effect from the list.'), flags: MessageFlags.Ephemeral });
        if (!media.isAvailable()) {
            return interaction.reply({ content: fail('Image editing isn\'t set up on this bot yet. The bot owner needs to run `npm run build:esmbot`.'), flags: MessageFlags.Ephemeral });
        }
        if (!media.availableEffects().includes(effectName)) {
            return interaction.reply({ content: fail(`\`${effectName}\` isn't available on this bot (it needs an extra library).`), flags: MessageFlags.Ephemeral });
        }

        const options = {
            text: interaction.options.getString('text') ?? '',
            amount: interaction.options.getNumber('amount') ?? undefined,
            font: interaction.options.getString('font') ?? undefined,
            flag: interaction.options.getBoolean('option') ?? false,
            togif: interaction.options.getBoolean('gif') ?? false,
        };
        if (effect.text === 'required' && !options.text.trim()) {
            return interaction.reply({ content: fail(`\`${effectName}\` needs some \`text\`${effect.textHint ? ` (${effect.textHint})` : ''}.`), flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ content: loading('Modifying image through esmBot...') });

        try {
            let input = null;
            if (!effect.noInput) {
                const url = await findImage(interaction);
                if (!url) return interaction.editReply(fail('I couldn\'t find an image. Attach one, give a `link`, or use this right after an image in the channel.'));
                input = { url };
            }

            const { buffer, ext } = await media.applyEffect(effectName, options, input);
            if (buffer.length > uploadLimit(interaction)) {
                return interaction.editReply(fail('The edited image is too big to upload here. Try a smaller image.'));
            }
            return interaction.editReply({
                content: `-# Modified with [esmBot](<https://github.com/esmBot/esmBot>) · \`${effectName}\``,
                files: [new AttachmentBuilder(buffer, { name: `${effectName}.${ext}` })],
            });
        } catch (error) {
            if (error.userFacing) return interaction.editReply(fail(error.message));
            if (/HTTP 4\d\d|Blocked|private|too large/i.test(error.message)) return interaction.editReply(fail(`I couldn't download that image: ${error.message}`));
            console.error(`[image] ${effectName} failed:`, error);
            return interaction.editReply(fail('Something went wrong editing that image. It may be too big or a format esmBot can\'t read.'));
        }
    },
};
