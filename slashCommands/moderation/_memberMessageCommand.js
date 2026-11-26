const {
    ActionRowBuilder,
    EmbedBuilder,
    InteractionContextType,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const {
    DEFAULTS,
    placeholdersFor,
    buildMemberMessage,
    getMessageConfig,
    isValidHexColor,
    normalizeHexColor,
    updateMessageConfig,
} = require('../../welcomeStore');
const { ok, fail } = require('../../ui');

const WORDING = {
    welcome: { when: 'joins', did: 'joined', describe: 'Customize the welcome message for new members', messageHint: 'Welcome {user}! Leave blank for none.' },
    goodbye: { when: 'leaves', did: 'left', describe: 'Customize the message sent when a member leaves', messageHint: '{username} left. Leave blank for none.' },
    boost: { when: 'boosts the server', did: 'boosted the server', describe: 'Customize the message sent when someone boosts the server', messageHint: '{user} Leave blank for none.' },
};

function createMemberMessageCommand(kind) {
const label = kind;
const Label = label[0].toUpperCase() + label.slice(1);
const { when, did, describe, messageHint } = WORDING[kind];
const getConfig = (guildId) => getMessageConfig(guildId, kind);
const updateConfig = (guildId, mutate) => updateMessageConfig(guildId, kind, mutate);
const DEFAULT = DEFAULTS[kind];

const MODAL_TIMEOUT_MS = 10 * 60 * 1000;

const placeholderList = () =>
    Object.entries(placeholdersFor(kind)).map(([token, meaning]) => `\`${token}\` ${meaning}`).join('\n');

function textInput(id, label, value, { style = TextInputStyle.Short, max, placeholder } = {}) {
    const input = new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(false)
        .setMaxLength(max);
    if (value) input.setValue(value.slice(0, max));
    if (placeholder) input.setPlaceholder(placeholder);
    return new ActionRowBuilder().addComponents(input);
}

async function runEdit(interaction) {
    const config = await getConfig(interaction.guild.id);
    const modalId = `${kind}-edit:${interaction.id}`;

    const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle(`Edit ${label} message`)
        .addComponents(
            textInput('message', 'Message (outside the embed)', config.message, {
                style: TextInputStyle.Paragraph, max: 2000, placeholder: messageHint,
            }),
            textInput('title', 'Embed title', config.embed.title, { max: 256, placeholder: DEFAULT.embed.title }),
            textInput('description', 'Embed description', config.embed.description, {
                style: TextInputStyle.Paragraph, max: 4000, placeholder: DEFAULT.embed.description,
            }),
            textInput('footer', 'Embed footer', config.embed.footer, { max: 2048, placeholder: DEFAULT.embed.footer }),
            textInput('color', 'Embed color (hex)', config.embed.color, { max: 7, placeholder: DEFAULT.embed.color }),
        );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        time: MODAL_TIMEOUT_MS,
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
    }).catch(() => null);
    if (!submitted) return;

    const field = (id) => submitted.fields.getTextInputValue(id).trim();
    const color = field('color');
    if (color && !isValidHexColor(color)) {
        return submitted.reply({ content: fail('That color isn\'t a hex code like `#00ff88`. Nothing was saved.'), flags: MessageFlags.Ephemeral });
    }

    const message = field('message');
    const title = field('title');
    const description = field('description');
    const footer = field('footer');

    const next = await updateConfig(interaction.guild.id, (cfg) => {
        cfg.message = message || null;
        cfg.embed.title = title || null;
        cfg.embed.description = description || null;
        cfg.embed.footer = footer || null;
        cfg.embed.color = color ? normalizeHexColor(color) : DEFAULT.embed.color;
    });

    const empty = !next.message && (!next.embed.enabled || (!next.embed.title && !next.embed.description));
    const warning = empty ? `\n-# Heads up: the message is empty, so nothing will be sent when someone ${when}.` : '';
    return submitted.reply({
        content: ok(`${Label} message saved. Here's a preview:${warning}`),
        ...previewPayload(interaction.member, next),
        flags: MessageFlags.Ephemeral,
    });
}

async function runStyle(interaction) {
    const embedEnabled = interaction.options.getBoolean('embed');
    const avatar = interaction.options.getBoolean('avatar');
    const image = interaction.options.getString('image');

    if (embedEnabled === null && avatar === null && image === null) {
        return interaction.reply({ content: fail('Pick at least one option to change.'), flags: MessageFlags.Ephemeral });
    }

    let imageUrl;
    if (image !== null) {
        if (['none', 'off', 'remove', 'clear'].includes(image.trim().toLowerCase())) {
            imageUrl = null;
        } else {
            try {
                const url = new URL(image.trim());
                if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
                imageUrl = url.href;
            } catch {
                return interaction.reply({ content: fail('The image must be an http(s) link, or `none` to remove it.'), flags: MessageFlags.Ephemeral });
            }
        }
    }

    const next = await updateConfig(interaction.guild.id, (cfg) => {
        if (embedEnabled !== null) cfg.embed.enabled = embedEnabled;
        if (avatar !== null) cfg.embed.avatar = avatar;
        if (imageUrl !== undefined) cfg.embed.image = imageUrl;
    });

    return interaction.reply({
        content: ok(`${Label} style updated. Here's a preview:`),
        ...previewPayload(interaction.member, next),
        flags: MessageFlags.Ephemeral,
    });
}

function previewPayload(member, config) {
    const { content, embeds } = buildMemberMessage(member, config);
    const previewEmbeds = [...embeds];
    if (content) {
        previewEmbeds.unshift(new EmbedBuilder().setColor(0x2b2d31).setDescription(`**Message text:**\n${content}`));
    }
    return { embeds: previewEmbeds.slice(0, 10), allowedMentions: { parse: [] } };
}

async function runTest(interaction) {
    const config = await getConfig(interaction.guild.id);
    const where = config.channelId
        ? `Sent in <#${config.channelId}> when someone ${when}.`
        : `${Label} messages are off. Turn them on with \`/setup ${label}\`.`;

    return interaction.reply({
        content: `**${Label} preview** (as if you just ${did})\n-# ${where}`,
        ...previewPayload(interaction.member, config),
        flags: MessageFlags.Ephemeral,
    });
}

async function runReset(interaction) {
    const next = await updateConfig(interaction.guild.id, (cfg) => ({
        ...DEFAULT,
        embed: { ...DEFAULT.embed },
        channelId: cfg.channelId,
    }));

    return interaction.reply({
        content: ok(`${Label} message reset to the default. The ${label} channel was kept.`),
        ...previewPayload(interaction.member, next),
        flags: MessageFlags.Ephemeral,
    });
}

    return {
    data: new SlashCommandBuilder()
        .setName(label)
        .setDescription(describe)
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub.setName('edit').setDescription(`Edit the ${label} text, embed title, description, footer and color`))
        .addSubcommand((sub) =>
            sub
                .setName('style')
                .setDescription(`Change how the ${label} message looks`)
                .addBooleanOption((opt) => opt.setName('embed').setDescription('Show the embed (off = text message only)'))
                .addBooleanOption((opt) => opt.setName('avatar').setDescription('Show the member\'s avatar in the embed'))
                .addStringOption((opt) =>
                    opt.setName('image').setDescription('Big image/GIF link at the bottom of the embed, or "none" to remove').setMaxLength(1000)))
        .addSubcommand((sub) => sub.setName('test').setDescription(`Preview the ${label} message`))
        .addSubcommand((sub) => sub.setName('placeholders').setDescription('List the placeholders you can use'))
        .addSubcommand((sub) => sub.setName('reset').setDescription(`Reset the ${label} message to the default`)),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: fail('You need the `Manage Server` permission to use this.'), flags: MessageFlags.Ephemeral });
        }

        switch (interaction.options.getSubcommand()) {
            case 'edit': return runEdit(interaction);
            case 'style': return runStyle(interaction);
            case 'test': return runTest(interaction);
            case 'reset': return runReset(interaction);
            case 'placeholders':
                return interaction.reply({
                    content: `**${Label} placeholders**\nUse these in any ${label} text and they're filled in for each member:\n${placeholderList()}`,
                    flags: MessageFlags.Ephemeral,
                });
        }
    },
};
}

module.exports = { createMemberMessageCommand };
