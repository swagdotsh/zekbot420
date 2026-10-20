const postgres = require('postgres');
const sql = postgres(process.env.NEON_DATABASE_URL, { ssl: 'require', onnotice: () => {} });
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
const { createTranscript, ExportReturnType, TranscriptImageDownloader } = require('discord-html-transcripts');
const { logTicketEvent } = require('./log');

const SMIRK = '<:smirk2:1498272372539785286>';
const OPEN_COOLDOWN_MS = 60 * 1000;
const DELETE_DELAY_MS = 5000;
const MAX_TRANSCRIPT_BYTES = 9.5 * 1024 * 1024;
const MAX_CATEGORY_CHANNELS = 50;
const TICKET_COLOR = 0x5865f2;

const openCooldowns = new Map();

const MEMBER_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];
const STAFF_PERMS = [...MEMBER_PERMS, PermissionFlagsBits.ManageMessages];
const BOT_PERMS = [...STAFF_PERMS, PermissionFlagsBits.ManageChannels];

async function initTicketDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS ticket_config (
            guild_id TEXT PRIMARY KEY,
            category_id TEXT,
            log_channel_id TEXT,
            support_role_ids TEXT,
            panel_channel_id TEXT,
            panel_message_id TEXT,
            next_number INT DEFAULT 1,
            max_open_per_user INT DEFAULT 1
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            number INT NOT NULL,
            channel_id TEXT UNIQUE,
            opener_id TEXT NOT NULL,
            claimed_by TEXT,
            status TEXT DEFAULT 'open',
            reason TEXT,
            welcome_message_id TEXT,
            created_at BIGINT,
            closed_at BIGINT,
            closed_by TEXT,
            close_reason TEXT
        )
    `;
}

function parseConfig(row) {
    if (!row) return null;
    return { ...row, supportRoleIds: (row.support_role_ids || '').split(',').filter(Boolean) };
}

async function getTicketConfig(guildId) {
    const rows = await sql`SELECT * FROM ticket_config WHERE guild_id = ${guildId}`;
    return parseConfig(rows[0]);
}

async function deleteTicketConfig(guildId) {
    const rows = await sql`DELETE FROM ticket_config WHERE guild_id = ${guildId} RETURNING guild_id`;
    return rows.length > 0;
}

async function getOpenTicketByChannel(channelId) {
    const rows = await sql`SELECT * FROM tickets WHERE channel_id = ${channelId} AND status = 'open'`;
    return rows[0] || null;
}

async function getTicket(id) {
    const rows = await sql`SELECT * FROM tickets WHERE id = ${id}`;
    return rows[0] || null;
}

function ticketName(number) {
    return `#${String(number).padStart(4, '0')}`;
}

function isStaff(member, config) {
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    return config.supportRoleIds.some(roleId => member.roles.cache.has(roleId));
}

function slug(text) {
    return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'user';
}

function ticketButtons(ticketId, claimedByName = null) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket:claim:${ticketId}`)
                .setEmoji('🙋')
                .setLabel(claimedByName ? `Claimed by ${claimedByName}`.slice(0, 80) : 'Claim')
                .setStyle(claimedByName ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(Boolean(claimedByName)),
            new ButtonBuilder()
                .setCustomId(`ticket:close:${ticketId}`)
                .setEmoji('🔒')
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger),
        ),
    ];
}

function buildPanel(guild) {
    const embed = new EmbedBuilder()
        .setColor(TICKET_COLOR)
        .setTitle('🎫 Need help?')
        .setDescription('Press the button below to open a private ticket with the staff team.')
        .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket:open:${guild.id}`)
            .setEmoji('🎫')
            .setLabel('Open a ticket')
            .setStyle(ButtonStyle.Primary),
    );

    return { embeds: [embed], components: [row] };
}

function missingBotPerms(channel, perms) {
    const me = channel.guild.members.me;
    return !channel.permissionsFor(me)?.has(perms);
}

async function setupTickets(guild, { categoryId = null, logChannelId = null, supportRoleIds, setupBy }) {
    const roles = supportRoleIds
        .map(id => guild.roles.cache.get(id))
        .filter(role => role && role.id !== guild.roles.everyone.id);
    if (!roles.length) return { error: `Give at least one support role, like \`${process.env.PREFIX}ticketsetup @Support\`. ${SMIRK}` };

    const me = guild.members.me;
    if (!me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
        return { error: `I need **Manage Channels** and **Manage Roles** to run tickets. ${SMIRK}` };
    }

    const reason = `Ticket setup by ${setupBy}`;
    const hidden = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: me.id, allow: BOT_PERMS },
        ...roles.map(role => ({ id: role.id, allow: STAFF_PERMS })),
    ];

    let category = categoryId ? guild.channels.cache.get(categoryId) : null;
    if (categoryId && category?.type !== ChannelType.GuildCategory) return { error: `That isn't a category in this server. ${SMIRK}` };
    const createdCategory = !category;
    if (!category) {
        category = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory, permissionOverwrites: hidden, reason });
    } else if (missingBotPerms(category, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels])) {
        return { error: `I need **View Channel** and **Manage Channels** in ${category.name}. ${SMIRK}` };
    }

    let logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
    if (logChannelId && (!logChannel?.isTextBased() || logChannel.guildId !== guild.id)) return { error: `That isn't a text channel in this server. ${SMIRK}` };
    const createdLog = !logChannel;
    if (!logChannel) {
        logChannel = await guild.channels.create({ name: 'ticket-logs', type: ChannelType.GuildText, parent: category.id, permissionOverwrites: hidden, reason });
    } else if (missingBotPerms(logChannel, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
        return { error: `I need **Send Messages** and **Attach Files** in ${logChannel}. ${SMIRK}` };
    }

    const roleIds = roles.map(role => role.id).join(',');
    await sql`
        INSERT INTO ticket_config (guild_id, category_id, log_channel_id, support_role_ids)
        VALUES (${guild.id}, ${category.id}, ${logChannel.id}, ${roleIds})
        ON CONFLICT (guild_id) DO UPDATE SET
            category_id = ${category.id},
            log_channel_id = ${logChannel.id},
            support_role_ids = ${roleIds}
    `;

    return { category, logChannel, roles, createdCategory, createdLog };
}

async function postPanel(channel) {
    if (channel.guildId == null) return { error: `Pick a channel in this server. ${SMIRK}` };
    const config = await getTicketConfig(channel.guildId);
    if (!config) return { error: `Tickets aren't set up yet. Run \`${process.env.PREFIX}ticketsetup @SupportRole\` first. ${SMIRK}` };
    if (!channel.isTextBased() || missingBotPerms(channel, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return { error: `I can't post in ${channel}, I need **Send Messages** and **Embed Links** there. ${SMIRK}` };
    }

    const message = await channel.send(buildPanel(channel.guild));
    await sql`UPDATE ticket_config SET panel_channel_id = ${channel.id}, panel_message_id = ${message.id} WHERE guild_id = ${channel.guildId}`;
    return { message };
}

async function openTicket(guild, member, reason) {
    const config = await getTicketConfig(guild.id);
    if (!config) return { error: `Tickets aren't set up on this server anymore. ${SMIRK}` };

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = ${guild.id} AND opener_id = ${member.id} AND status = 'open'`;
    if (count >= config.max_open_per_user) {
        const existing = await sql`SELECT channel_id FROM tickets WHERE guild_id = ${guild.id} AND opener_id = ${member.id} AND status = 'open' LIMIT 1`;
        return { error: `You already have an open ticket: <#${existing[0]?.channel_id}>` };
    }

    const category = guild.channels.cache.get(config.category_id);
    if (category?.type !== ChannelType.GuildCategory) return { error: `The ticket category is gone, ask staff to run \`${process.env.PREFIX}ticketsetup\` again. ${SMIRK}` };
    if (category.children.cache.size >= MAX_CATEGORY_CHANNELS) return { error: `There are too many open tickets right now, try again later. ${SMIRK}` };

    const [{ number }] = await sql`
        UPDATE ticket_config SET next_number = next_number + 1 WHERE guild_id = ${guild.id} RETURNING next_number - 1 AS number
    `;

    const roles = config.supportRoleIds.filter(id => guild.roles.cache.has(id));
    const channel = await guild.channels.create({
        name: `ticket-${String(number).padStart(4, '0')}-${slug(member.user.username)}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket ${ticketName(number)} opened by ${member.user.tag}`,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: guild.members.me.id, allow: BOT_PERMS },
            { id: member.id, allow: MEMBER_PERMS },
            ...roles.map(id => ({ id, allow: STAFF_PERMS })),
        ],
        reason: `Ticket ${ticketName(number)} opened by ${member.user.tag}`,
    });

    const [ticket] = await sql`
        INSERT INTO tickets (guild_id, number, channel_id, opener_id, reason, created_at)
        VALUES (${guild.id}, ${number}, ${channel.id}, ${member.id}, ${reason || null}, ${Date.now()})
        RETURNING *
    `;

    const embed = new EmbedBuilder()
        .setColor(TICKET_COLOR)
        .setTitle(`🎫 Ticket ${ticketName(number)}`)
        .setDescription(`Thanks for reaching out, ${member}! Staff will be with you shortly.\nPress **Close** when you're done.`)
        .addFields({ name: 'Reason', value: reason?.slice(0, 1024) || '*No reason given*' })
        .setTimestamp();

    const welcome = await channel.send({
        content: [member.toString(), ...roles.map(id => `<@&${id}>`)].join(' '),
        embeds: [embed],
        components: ticketButtons(ticket.id),
        allowedMentions: { users: [member.id], roles },
    });
    await sql`UPDATE tickets SET welcome_message_id = ${welcome.id} WHERE id = ${ticket.id}`;

    await logTicketEvent(guild, new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle(`Ticket ${ticketName(number)} opened`)
        .addFields(
            { name: 'Opened By', value: `${member.user.tag} (${member.id})`, inline: true },
            { name: 'Channel', value: channel.toString(), inline: true },
            { name: 'Reason', value: reason?.slice(0, 1024) || '*No reason given*' },
        )
        .setTimestamp());

    return { channel, ticket };
}

async function claimTicket(guild, ticket, member) {
    const config = await getTicketConfig(guild.id);
    if (!config || !isStaff(member, config)) return { error: 'Only staff can claim tickets.' };
    if (ticket.claimed_by) return { error: `This ticket is already claimed by <@${ticket.claimed_by}>.` };

    const rows = await sql`UPDATE tickets SET claimed_by = ${member.id} WHERE id = ${ticket.id} AND claimed_by IS NULL AND status = 'open' RETURNING id`;
    if (!rows.length) return { error: 'Someone else just claimed this ticket.' };

    const channel = guild.channels.cache.get(ticket.channel_id);
    const welcome = ticket.welcome_message_id ? await channel?.messages.fetch(ticket.welcome_message_id).catch(() => null) : null;
    await welcome?.edit({ components: ticketButtons(ticket.id, member.displayName) }).catch(() => {});
    return { channel };
}

async function buildTranscript(channel, number) {
    const filename = `ticket-${String(number).padStart(4, '0')}.html`;
    const options = {
        limit: -1,
        returnType: ExportReturnType.Buffer,
        filename,
        poweredBy: false,
        hydrate: true,
        footerText: `Ticket ${ticketName(number)} · {number} message{s}`,
    };

    try {
        const withImages = await createTranscript(channel, {
            ...options,
            callbacks: { resolveImageSrc: new TranscriptImageDownloader().withMaxSize(2048).withCompression(60, true).build() },
        });
        if (withImages.length <= MAX_TRANSCRIPT_BYTES) return { buffer: withImages, filename, imagesSaved: true };
    } catch (err) {
        console.error(`Transcript with images failed for ticket ${number}, retrying without:`, err);
    }

    const plain = await createTranscript(channel, options);
    return plain.length <= MAX_TRANSCRIPT_BYTES ? { buffer: plain, filename, imagesSaved: false } : null;
}

async function closeTicket(client, staleTicket, closer, closeReason) {
    const [ticket] = await sql`UPDATE tickets SET status = 'closing' WHERE id = ${staleTicket.id} AND status = 'open' RETURNING *`;
    if (!ticket) return { error: 'This ticket is already closing.' };

    const guild = client.guilds.cache.get(ticket.guild_id);
    const config = await getTicketConfig(ticket.guild_id);
    const channel = guild?.channels.cache.get(ticket.channel_id);

    if (channel) {
        await channel.permissionOverwrites.edit(ticket.opener_id, { SendMessages: false }).catch(() => {});
        await channel.send(`🔒 Closed by **${closer.tag}**. Saving the transcript, this channel will be deleted in a few seconds.`).catch(() => {});
    }

    const transcript = channel ? await buildTranscript(channel, ticket.number).catch((err) => {
        console.error(`Transcript failed for ticket ${ticket.number}:`, err);
        return null;
    }) : null;

    const closedAt = Date.now();
    await sql`
        UPDATE tickets SET status = 'closed', closed_at = ${closedAt}, closed_by = ${closer.id}, close_reason = ${closeReason || null}
        WHERE id = ${ticket.id}
    `;

    const summary = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`Ticket ${ticketName(ticket.number)} closed`)
        .addFields(
            { name: 'Opened By', value: `<@${ticket.opener_id}>`, inline: true },
            { name: 'Claimed By', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Nobody', inline: true },
            { name: 'Closed By', value: `${closer.tag}`, inline: true },
            { name: 'Reason', value: ticket.reason?.slice(0, 1024) || '*No reason given*' },
            { name: 'Close Reason', value: closeReason?.slice(0, 1024) || '*No reason given*' },
            { name: 'Opened', value: `<t:${Math.floor(Number(ticket.created_at) / 1000)}:f>`, inline: true },
            { name: 'Closed', value: `<t:${Math.floor(closedAt / 1000)}:f>`, inline: true },
        )
        .setFooter({ text: transcript ? (transcript.imagesSaved ? 'Transcript attached' : 'Transcript attached (too big to include images)') : 'No transcript, the ticket was too large or the channel was gone' })
        .setTimestamp(closedAt);

    const files = () => (transcript ? [new AttachmentBuilder(transcript.buffer, { name: transcript.filename })] : []);

    const logChannel = config?.log_channel_id ? guild?.channels.cache.get(config.log_channel_id) : null;
    await logChannel?.send({ embeds: [summary], files: files() }).catch(err => console.error('Failed to post ticket transcript:', err));

    const opener = await client.users.fetch(ticket.opener_id).catch(() => null);
    await opener?.send({ content: `Your ticket in **${guild?.name ?? 'a server'}** was closed. Here's a copy of the conversation.`, embeds: [summary], files: files() }).catch(() => {});

    if (guild) await logTicketEvent(guild, summary);

    if (channel) setTimeout(() => channel.delete(`Ticket ${ticketName(ticket.number)} closed by ${closer.tag}`).catch(() => {}), DELETE_DELAY_MS);
    return { transcript };
}

async function setTicketAccess(channel, ticket, user, allowed) {
    if (!allowed && user.id === ticket.opener_id) return { error: "You can't remove the person who opened the ticket." };

    if (allowed) {
        await channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
        }, { reason: `Added to ticket ${ticketName(ticket.number)}` });
    } else {
        await channel.permissionOverwrites.delete(user.id, `Removed from ticket ${ticketName(ticket.number)}`);
    }
    return {};
}

async function markDeletedTicket(channelId) {
    await sql`
        UPDATE tickets SET status = 'closed', closed_at = ${Date.now()}, close_reason = 'Channel was deleted'
        WHERE channel_id = ${channelId} AND status = 'open'
    `;
}

async function noteOpenerLeft(member) {
    const rows = await sql`SELECT channel_id FROM tickets WHERE guild_id = ${member.guild.id} AND opener_id = ${member.id} AND status = 'open'`;
    for (const row of rows) {
        const channel = member.guild.channels.cache.get(row.channel_id);
        await channel?.send(`⚠️ **${member.user.tag}** left the server. Close this ticket when you're done with it.`).catch(() => {});
    }
}

function reasonModal(customId, title, label, required) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('reason')
                .setLabel(label)
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1000)
                .setRequired(required),
        ));
}

async function handleTicketInteraction(interaction) {
    if (!(interaction.isButton() || interaction.isModalSubmit()) || !interaction.customId.startsWith('ticket:')) return false;
    const [, action, id] = interaction.customId.split(':');
    const ephemeral = MessageFlags.Ephemeral;

    if (action === 'open' && interaction.isButton()) {
        const config = await getTicketConfig(interaction.guildId);
        if (!config) {
            await interaction.reply({ content: `Tickets aren't set up on this server anymore. ${SMIRK}`, flags: ephemeral });
            return true;
        }

        const existing = await sql`SELECT channel_id FROM tickets WHERE guild_id = ${interaction.guildId} AND opener_id = ${interaction.user.id} AND status = 'open'`;
        if (existing.length >= config.max_open_per_user) {
            await interaction.reply({ content: `You already have an open ticket: <#${existing[0].channel_id}>`, flags: ephemeral });
            return true;
        }

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const waited = Date.now() - (openCooldowns.get(key) ?? 0);
        if (waited < OPEN_COOLDOWN_MS) {
            await interaction.reply({ content: `Slow down, you can open another ticket in ${Math.ceil((OPEN_COOLDOWN_MS - waited) / 1000)}s.`, flags: ephemeral });
            return true;
        }

        await interaction.showModal(reasonModal(`ticket:openmodal:${interaction.guildId}`, 'Open a ticket', 'What do you need help with?', true));
        return true;
    }

    if (action === 'openmodal' && interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: ephemeral });
        openCooldowns.set(`${interaction.guildId}:${interaction.user.id}`, Date.now());
        const result = await openTicket(interaction.guild, interaction.member, interaction.fields.getTextInputValue('reason').trim());
        await interaction.editReply(result.error ?? `Your ticket is open: ${result.channel}`);
        return true;
    }

    const ticket = await getTicket(Number(id));
    if (!ticket || ticket.status !== 'open') {
        await interaction.reply({ content: 'This ticket is already closed.', flags: ephemeral }).catch(() => {});
        return true;
    }

    if (action === 'claim') {
        const result = await claimTicket(interaction.guild, ticket, interaction.member);
        if (result.error) await interaction.reply({ content: result.error, flags: ephemeral });
        else await interaction.reply({ content: `🙋 **${interaction.member.displayName}** claimed this ticket.`, allowedMentions: { parse: [] } });
        return true;
    }

    if (action === 'close' && interaction.isButton()) {
        const config = await getTicketConfig(interaction.guildId);
        if (interaction.user.id !== ticket.opener_id && !(config && isStaff(interaction.member, config))) {
            await interaction.reply({ content: 'Only the person who opened this ticket or staff can close it.', flags: ephemeral });
            return true;
        }
        await interaction.showModal(reasonModal(`ticket:closemodal:${ticket.id}`, `Close ticket ${ticketName(ticket.number)}`, 'Reason for closing (optional)', false));
        return true;
    }

    if (action === 'closemodal' && interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: ephemeral });
        const result = await closeTicket(interaction.client, ticket, interaction.user, interaction.fields.getTextInputValue('reason').trim());
        await interaction.editReply(result.error ?? 'Ticket closed.').catch(() => {});
        return true;
    }

    return false;
}

module.exports = {
    initTicketDB,
    getTicketConfig,
    deleteTicketConfig,
    getOpenTicketByChannel,
    isStaff,
    setupTickets,
    postPanel,
    claimTicket,
    closeTicket,
    setTicketAccess,
    markDeletedTicket,
    noteOpenerLeft,
    handleTicketInteraction,
};
