const { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { addVcBan, removeVcBan, getVcBan, listVcBans, enforce } = require('../../vcBans');
const { parseDuration } = require('../../reminders');
const { canModerate } = require('../../hierarchy');
const { ok, fail } = require('../../ui');

const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vcban')
        .setDescription('Keep members out of voice channels')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
        .addSubcommand((sub) =>
            sub.setName('add').setDescription('Ban a member from joining voice channels')
                .addUserOption((opt) => opt.setName('user').setDescription('Member to VC ban').setRequired(true))
                .addStringOption((opt) => opt.setName('duration').setDescription('How long, like 30m, 2h or 7d (default: until removed)'))
                .addStringOption((opt) => opt.setName('reason').setDescription('Why (sent to them in a DM)').setMaxLength(500)))
        .addSubcommand((sub) =>
            sub.setName('remove').setDescription('Let a member join voice channels again')
                .addUserOption((opt) => opt.setName('user').setDescription('Member to un-VC ban').setRequired(true)))
        .addSubcommand((sub) => sub.setName('list').setDescription('List VC banned members')),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers)) {
            return interaction.reply({ content: fail('You need the `Move Members` permission to use this.'), flags: MessageFlags.Ephemeral });
        }

        const guild = interaction.guild;
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const bans = await listVcBans(guild.id);
            if (!bans.length) return interaction.reply({ content: 'Nobody is VC banned.', flags: MessageFlags.Ephemeral });
            const lines = bans.slice(0, 40).map((ban) => {
                const until = ban.until ? `until <t:${Math.floor(ban.until / 1000)}:R>` : 'permanently';
                return `• <@${ban.userId}> ${until} by <@${ban.by}>${ban.reason ? `: ${ban.reason.slice(0, 80)}` : ''}`;
            });
            if (bans.length > 40) lines.push(`…and ${bans.length - 40} more`);
            const embed = new EmbedBuilder().setColor(0xed4245).setTitle(`🔇 VC bans (${bans.length})`).setDescription(lines.join('\n'));
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }

        const user = interaction.options.getUser('user', true);

        if (sub === 'remove') {
            const removed = await removeVcBan(guild.id, user.id);
            return interaction.reply({
                content: removed ? ok(`${user} can join voice channels again.`) : fail(`${user} isn't VC banned.`),
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            });
        }

        if (user.bot) return interaction.reply({ content: fail('Bots can\'t be VC banned.'), flags: MessageFlags.Ephemeral });
        if (user.id === interaction.user.id) return interaction.reply({ content: fail('You can\'t VC ban yourself.'), flags: MessageFlags.Ephemeral });

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (member && !canModerate(interaction.member, member)) {
            return interaction.reply({ content: fail(`You can't VC ban ${user}: their highest role is equal to or above yours.`), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }

        const durationText = interaction.options.getString('duration');
        let until = null;
        if (durationText) {
            const ms = parseDuration(durationText);
            if (!ms || ms > MAX_DURATION_MS) {
                return interaction.reply({ content: fail('Give a duration like `30m`, `2h`, `7d` or `1w` (up to a year).'), flags: MessageFlags.Ephemeral });
            }
            until = Date.now() + ms;
        }

        const reason = interaction.options.getString('reason');
        const existing = await getVcBan(guild.id, user.id);
        await addVcBan(guild.id, user.id, { by: interaction.user.id, reason, until });

        const ban = { reason, until };
        const kicked = member ? await enforce(member, ban).catch(() => false) : false;
        const canMove = guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers);

        const length = until ? `until <t:${Math.floor(until / 1000)}:f>` : 'until you remove it';
        const notes = [];
        if (kicked) notes.push('They were disconnected from voice.');
        if (!canMove) notes.push('I need the `Move Members` permission to disconnect them.');
        return interaction.reply({
            content: ok(`${user} is ${existing ? 'still' : 'now'} VC banned ${length}.`) + (notes.length ? `\n-# ${notes.join(' ')}` : ''),
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    },
};
