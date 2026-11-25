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
    DEFAULT_WELCOME,
    PLACEHOLDERS,
    buildWelcomeMessage,
    getWelcomeConfig,
    isValidHexColor,
    normalizeHexColor,
    updateWelcomeConfig,
} = require('../../welcomeStore');
const { ok, fail } = require('../../ui');

const MODAL_TIMEOUT_MS = 10 * 60 * 1000;

const placeholderList = () =>
    Object.entries(PLACEHOLDERS).map(([token, meaning]) => `\`${token}\` ${meaning}`).join('\n');

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
    const config = await getWelcomeConfig(interaction.guild.id);
    const modalId = `welcome-edit:${interaction.id}`;

    const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Edit welcome message')
        .addComponents(
            textInput('message', 'Message (outside the embed)', config.message, {
                style: TextInputStyle.Paragraph, max: 2000, placeholder: 'Welcome {user}! Leave blank for none.',
            }),
            textInput('title', 'Embed title', config.embed.title, { max: 256, placeholder: 'Welcome {username}!' }),
            textInput('description', 'Embed description', config.embed.description, {
                style: TextInputStyle.Paragraph, max: 4000, placeholder: 'Enjoy your stay! Read the rules in #rules.',
            }),
            textInput('footer', 'Embed footer', config.embed.footer, { max: 2048, placeholder: '{server} is now at {membercount} members.' }),
            textInput('color', 'Embed color (hex)', config.embed.color, { max: 7, placeholder: '#00ff88' }),
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

    const next = await updateWelcomeConfig(interaction.guild.id, (cfg) => {
        cfg.message = message || null;
        cfg.embed.title = title || null;
        cfg.embed.description = description || null;
        cfg.embed.footer = footer || null;
        cfg.embed.color = color ? normalizeHexColor(color) : DEFAULT_WELCOME.embed.color;
    });

    const empty = !next.message && (!next.embed.enabled || (!next.embed.title && !next.embed.description));
    const warning = empty ? '\n-# Heads up: the message is empty, so nothing will be sent when someone joins.' : '';
    return submitted.reply({
        content: ok(`Welcome message saved. Here's a preview:${warning}`),
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

    const next = await updateWelcomeConfig(interaction.guild.id, (cfg) => {
        if (embedEnabled !== null) cfg.embed.enabled = embedEnabled;
        if (avatar !== null) cfg.embed.avatar = avatar;
        if (imageUrl !== undefined) cfg.embed.image = imageUrl;
    });

    return interaction.reply({
        content: ok('Welcome style updated. Here\'s a preview:'),
        ...previewPayload(interaction.member, next),
        flags: MessageFlags.Ephemeral,
    });
}

function previewPayload(member, config) {
    const { content, embeds } = buildWelcomeMessage(member, config);
    const previewEmbeds = [...embeds];
    if (content) {
        previewEmbeds.unshift(new EmbedBuilder().setColor(0x2b2d31).setDescription(`**Message text:**\n${content}`));
    }
    return { embeds: previewEmbeds.slice(0, 10), allowedMentions: { parse: [] } };
}

async function runTest(interaction) {
    const config = await getWelcomeConfig(interaction.guild.id);
    const where = config.channelId
        ? `Sent in <#${config.channelId}> when someone joins.`
        : 'Welcome messages are off. Turn them on with `/setup welcome`.';

    return interaction.reply({
        content: `**Welcome preview** (as if you just joined)\n-# ${where}`,
        ...previewPayload(interaction.member, config),
        flags: MessageFlags.Ephemeral,
    });
}

async function runReset(interaction) {
    const next = await updateWelcomeConfig(interaction.guild.id, (cfg) => ({
        ...DEFAULT_WELCOME,
        embed: { ...DEFAULT_WELCOME.embed },
        channelId: cfg.channelId,
    }));

    return interaction.reply({
        content: ok('Welcome message reset to the default. The welcome channel was kept.'),
        ...previewPayload(interaction.member, next),
        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Customize the welcome message for new members')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub.setName('edit').setDescription('Edit the welcome text, embed title, description, footer and color'))
        .addSubcommand((sub) =>
            sub
                .setName('style')
                .setDescription('Change how the welcome message looks')
                .addBooleanOption((opt) => opt.setName('embed').setDescription('Show the embed (off = text message only)'))
                .addBooleanOption((opt) => opt.setName('avatar').setDescription('Show the new member\'s avatar in the embed'))
                .addStringOption((opt) =>
                    opt.setName('image').setDescription('Big image/GIF link at the bottom of the embed, or "none" to remove').setMaxLength(1000)))
        .addSubcommand((sub) => sub.setName('test').setDescription('Preview the welcome message as if you just joined'))
        .addSubcommand((sub) => sub.setName('placeholders').setDescription('List the placeholders you can use'))
        .addSubcommand((sub) => sub.setName('reset').setDescription('Reset the welcome message to the default')),

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
                    content: `**Welcome placeholders**\nUse these in any welcome text and they're filled in for each new member:\n${placeholderList()}`,
                    flags: MessageFlags.Ephemeral,
                });
        }
    },
};
