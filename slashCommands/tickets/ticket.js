const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    MessageFlags,
} = require('discord.js');
const {
    setupTickets,
    deleteTicketConfig,
    postPanel,
    getOpenTicketByChannel,
    getTicketConfig,
    isStaff,
    claimTicket,
    closeTicket,
    setTicketAccess,
} = require('../../ticketHandler');

const SMIRK = '<:smirk2:1498272372539785286>';
const ephemeral = MessageFlags.Ephemeral;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Support tickets')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription('Set up tickets (Manage Server)')
                .addRoleOption((opt) => opt.setName('support-role').setDescription('Role that handles tickets').setRequired(true))
                .addRoleOption((opt) => opt.setName('support-role-2').setDescription('Another role that handles tickets'))
                .addChannelOption((opt) =>
                    opt.setName('category').setDescription('Category for ticket channels (created if left out)').addChannelTypes(ChannelType.GuildCategory)
                )
                .addChannelOption((opt) =>
                    opt.setName('log-channel').setDescription('Where transcripts go (created if left out)').addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('panel')
                .setDescription('Post the "Open a ticket" button (Manage Server)')
                .addChannelOption((opt) =>
                    opt.setName('channel').setDescription('Channel to post in (defaults to this one)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((sub) => sub.setName('disable').setDescription('Turn tickets off (Manage Server)'))
        .addSubcommand((sub) =>
            sub.setName('add').setDescription('Add someone to this ticket').addUserOption((opt) => opt.setName('user').setDescription('Who to add').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('remove').setDescription('Remove someone from this ticket').addUserOption((opt) => opt.setName('user').setDescription('Who to remove').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('rename').setDescription('Rename this ticket').addStringOption((opt) => opt.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(90))
        )
        .addSubcommand((sub) => sub.setName('claim').setDescription('Claim this ticket'))
        .addSubcommand((sub) =>
            sub.setName('close').setDescription('Close this ticket').addStringOption((opt) => opt.setName('reason').setDescription('Why it was closed').setMaxLength(1000))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (['setup', 'panel', 'disable'].includes(sub)) {
                if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: `You need the **Manage Server** permission for that. ${SMIRK}`, flags: ephemeral });
                }

                if (sub === 'disable') {
                    const removed = await deleteTicketConfig(interaction.guildId);
                    return interaction.reply({
                        content: removed ? 'Tickets are turned off. Open tickets stay until they are closed.' : 'Tickets were not set up on this server.',
                        flags: ephemeral,
                    });
                }

                if (sub === 'panel') {
                    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
                    const result = await postPanel(channel);
                    return interaction.reply({ content: result.error ?? `Posted the ticket panel in ${channel}.`, flags: ephemeral });
                }

                await interaction.deferReply({ flags: ephemeral });
                const roleIds = ['support-role', 'support-role-2'].map(name => interaction.options.getRole(name)?.id).filter(Boolean);
                const result = await setupTickets(interaction.guild, {
                    categoryId: interaction.options.getChannel('category')?.id ?? null,
                    logChannelId: interaction.options.getChannel('log-channel')?.id ?? null,
                    supportRoleIds: roleIds,
                    setupBy: interaction.user.tag,
                });
                if (result.error) return interaction.editReply(result.error);

                return interaction.editReply(
                    `✅ Tickets are set up!\n` +
                    `**Category:** ${result.category.name}${result.createdCategory ? ' (created)' : ''}\n` +
                    `**Transcripts:** ${result.logChannel}${result.createdLog ? ' (created)' : ''}\n` +
                    `**Support roles:** ${result.roles.map(role => role.toString()).join(', ')}\n` +
                    `-# Now post the button with \`/ticket panel\`.`
                );
            }

            const ticket = await getOpenTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: `Use this inside an open ticket channel. ${SMIRK}`, flags: ephemeral });

            const config = await getTicketConfig(interaction.guildId);
            const staff = config ? isStaff(interaction.member, config) : false;

            if (sub === 'close') {
                if (interaction.user.id !== ticket.opener_id && !staff) {
                    return interaction.reply({ content: 'Only the person who opened this ticket or staff can close it.', flags: ephemeral });
                }
                await interaction.deferReply({ flags: ephemeral });
                const result = await closeTicket(interaction.client, ticket, interaction.user, interaction.options.getString('reason')?.trim());
                return interaction.editReply(result.error ?? 'Ticket closed.').catch(() => {});
            }

            if (!staff) return interaction.reply({ content: `Only staff can do that. ${SMIRK}`, flags: ephemeral });

            if (sub === 'claim') {
                const result = await claimTicket(interaction.guild, ticket, interaction.member);
                if (result.error) return interaction.reply({ content: result.error, flags: ephemeral });
                return interaction.reply({ content: `🙋 **${interaction.member.displayName}** claimed this ticket.`, allowedMentions: { parse: [] } });
            }

            if (sub === 'rename') {
                const name = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
                if (!name) return interaction.reply({ content: 'That name has no usable characters.', flags: ephemeral });
                await interaction.deferReply();
                await interaction.channel.setName(name, `Renamed by ${interaction.user.tag}`);
                return interaction.editReply(`Renamed this ticket to **${name}**.`);
            }

            const user = interaction.options.getUser('user');
            const result = await setTicketAccess(interaction.channel, ticket, user, sub === 'add');
            if (result.error) return interaction.reply({ content: result.error, flags: ephemeral });
            return interaction.reply(sub === 'add' ? `Added ${user} to this ticket.` : `Removed **${user.tag}** from this ticket.`);
        } catch (err) {
            console.error(`/ticket ${sub} failed:`, err);
            const payload = { content: `Something went wrong. ${SMIRK}`, flags: ephemeral };
            if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
            return interaction.reply(payload).catch(() => {});
        }
    },
};
