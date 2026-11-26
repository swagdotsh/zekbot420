const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { createGuildStore } = require('./guildDataStore');
const { fetchLimited } = require('./safeFetch');
const { ok, fail } = require('./ui');

const store = createGuildStore('confessions.json', () => ({
    channelId: null,
    count: 0,
    authors: {},
    replies: 0,
    banned: [],
}));

const COOLDOWN_MS = 60 * 1000;
const MAX_LENGTH = 2000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const cooldowns = new Map();
const COLORS = [0x5865f2, 0xeb459e, 0x57f287, 0xfee75c, 0xed4245, 0x9b59b6, 0x1abc9c];

const confessButtons = (replyTo) => {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confess:new').setLabel('Confess').setEmoji('🤫').setStyle(ButtonStyle.Primary),
    );
    if (replyTo) {
        row.addComponents(
            new ButtonBuilder().setCustomId(`confess:reply:${replyTo}`).setLabel('Reply').setEmoji('💬').setStyle(ButtonStyle.Secondary),
        );
    }
    return row;
};

function confessionModal(customId, title, label) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('text')
                .setLabel(label)
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(1)
                .setMaxLength(MAX_LENGTH)
                .setRequired(true),
        ));
}

function onCooldown(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const until = cooldowns.get(key) ?? 0;
    if (until > Date.now()) return Math.ceil((until - Date.now()) / 1000);
    return 0;
}

function startCooldown(guildId, userId) {
    cooldowns.set(`${guildId}:${userId}`, Date.now() + COOLDOWN_MS);
}

async function checkCanConfess(interaction, config) {
    if (!config.channelId) return 'Confessions are not set up in this server. An admin can run `/setup confessions`.';
    if (config.banned.includes(interaction.user.id)) return 'You have been banned from confessing in this server.';
    const wait = onCooldown(interaction.guild.id, interaction.user.id);
    if (wait) return `You can confess again in ${wait}s.`;
    return null;
}

async function postConfession(interaction, text, attachment) {
    const guild = interaction.guild;
    const config = await store.get(guild.id);
    const problem = await checkCanConfess(interaction, config);
    if (problem) return interaction.reply({ content: fail(problem), flags: MessageFlags.Ephemeral });

    const channel = guild.channels.cache.get(config.channelId);
    const perms = channel?.permissionsFor(guild.members.me);
    if (!channel || !perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: fail('I can\'t post in the confession channel. Ask an admin to check my permissions.'), flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    startCooldown(guild.id, interaction.user.id);

    let number;
    await store.update(guild.id, (data) => {
        data.count += 1;
        number = data.count;
        data.authors[number] = interaction.user.id;
    });

    const embed = new EmbedBuilder()
        .setColor(COLORS[number % COLORS.length])
        .setTitle(`Anonymous Confession #${number}`)
        .setDescription(text)
        .setTimestamp();
    const files = [];
    if (attachment?.contentType?.startsWith('image/')) {
        const ext = (attachment.name?.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png';
        const image = await fetchLimited(attachment.url, { maxBytes: MAX_IMAGE_BYTES }).catch(() => null);
        if (image) {
            files.push(new AttachmentBuilder(image, { name: `confession.${ext}` }));
            embed.setImage(`attachment://confession.${ext}`);
        }
    }

    try {
        await channel.send({ embeds: [embed], files, components: [confessButtons(number)], allowedMentions: { parse: [] } });
    } catch (error) {
        console.error('[confessions] failed to post:', error);
        return interaction.editReply(fail('Something went wrong posting your confession. Try again in a moment.'));
    }

    const where = interaction.channelId === channel.id ? '' : ` in ${channel}`;
    return interaction.editReply(ok(`Your confession was posted anonymously as **#${number}**${where}.`));
}

async function postReply(interaction, confessionNumber, text) {
    const guild = interaction.guild;
    const config = await store.get(guild.id);
    const problem = await checkCanConfess(interaction, config);
    if (problem) return interaction.reply({ content: fail(problem), flags: MessageFlags.Ephemeral });

    const message = interaction.message;
    if (!message) return interaction.reply({ content: fail('That confession is no longer available.'), flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    startCooldown(guild.id, interaction.user.id);

    let replyNumber;
    await store.update(guild.id, (data) => {
        data.replies += 1;
        replyNumber = data.replies;
        data.authors[`r${replyNumber}`] = interaction.user.id;
    });

    const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({ name: `Anonymous reply to #${confessionNumber}` })
        .setDescription(text)
        .setFooter({ text: `Reply ID r${replyNumber}` })
        .setTimestamp();

    try {
        let target = message.thread;
        const canThread = message.channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.CreatePublicThreads);
        if (!target && canThread && message.channel.type === ChannelType.GuildText) {
            target = await message.startThread({ name: `Confession #${confessionNumber} replies`, autoArchiveDuration: 1440 }).catch(() => null);
        }
        if (target) await target.send({ embeds: [embed], allowedMentions: { parse: [] } });
        else await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
        console.error('[confessions] failed to post reply:', error);
        return interaction.editReply(fail('Something went wrong posting your reply. Try again in a moment.'));
    }

    return interaction.editReply(ok(`Your anonymous reply to confession #${confessionNumber} was posted.`));
}

async function handleConfessionInteraction(interaction) {
    if (!interaction.guild) return false;

    if (interaction.isButton() && interaction.customId.startsWith('confess:')) {
        const [, action, number] = interaction.customId.split(':');
        if (action === 'new') {
            await interaction.showModal(confessionModal('confess:submit', 'Anonymous confession', 'Your confession (nobody will see your name)'));
        } else if (action === 'reply') {
            await interaction.showModal(confessionModal(`confess:replysubmit:${number}`, `Reply to confession #${number}`, 'Your reply (nobody will see your name)'));
        }
        return true;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('confess:')) {
        const [, action, number] = interaction.customId.split(':');
        const text = interaction.fields.getTextInputValue('text').trim();
        if (!text) {
            await interaction.reply({ content: fail('Your confession was empty.'), flags: MessageFlags.Ephemeral });
        } else if (action === 'submit') {
            await postConfession(interaction, text, null);
        } else if (action === 'replysubmit') {
            await postReply(interaction, number, text);
        }
        return true;
    }

    return false;
}

async function setAuthorBan(guildId, ref, banned) {
    const key = String(ref).trim().replace(/^#/, '').toLowerCase();
    let found = false;
    let alreadyInState = false;
    await store.update(guildId, (data) => {
        const authorId = data.authors[key];
        if (!authorId) return;
        found = true;
        const has = data.banned.includes(authorId);
        alreadyInState = has === banned;
        if (banned && !has) data.banned.push(authorId);
        if (!banned && has) data.banned = data.banned.filter(id => id !== authorId);
    });
    return { found, alreadyInState };
}

module.exports = {
    store,
    postConfession,
    handleConfessionInteraction,
    setAuthorBan,
    confessButtons,
};
