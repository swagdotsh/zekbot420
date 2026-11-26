const { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { store, BUILT_IN_BOTS, botInfo } = require('../../bumpReminders');
const { ok, fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bumpreminder')
        .setDescription('Bump reminders for server listing bots like DISBOARD')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('status').setDescription('Show when each bot can be bumped next'))
        .addSubcommand((sub) =>
            sub.setName('addbot').setDescription('Track another listing bot\'s /bump (DISBOARD is built in)')
                .addUserOption((opt) => opt.setName('bot').setDescription('The listing bot').setRequired(true))
                .addNumberOption((opt) => opt.setName('hours').setDescription('Its bump cooldown in hours, like 2 or 24').setRequired(true).setMinValue(0.25).setMaxValue(168)))
        .addSubcommand((sub) =>
            sub.setName('removebot').setDescription('Stop tracking a listing bot you added')
                .addUserOption((opt) => opt.setName('bot').setDescription('The listing bot').setRequired(true)))
        .addSubcommand((sub) =>
            sub.setName('message').setDescription('Change the reminder text ({bot} and {command} are filled in)')
                .addStringOption((opt) => opt.setName('text').setDescription('Reminder text, or "default" to reset').setRequired(true).setMaxLength(500))),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: fail('You need the `Manage Server` permission to use this.'), flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guild.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'addbot') {
            const bot = interaction.options.getUser('bot', true);
            if (!bot.bot) return interaction.reply({ content: fail(`${bot} isn't a bot.`), flags: MessageFlags.Ephemeral });
            if (BUILT_IN_BOTS[bot.id]) return interaction.reply({ content: fail(`${BUILT_IN_BOTS[bot.id].name} is already tracked automatically.`), flags: MessageFlags.Ephemeral });
            const hours = interaction.options.getNumber('hours', true);
            await store.update(guildId, (data) => {
                data.bots[bot.id] = { name: bot.username, cooldownMinutes: Math.round(hours * 60) };
            });
            return interaction.reply({
                content: ok(`Tracking ${bot} with a ${hours} hour cooldown. When it confirms a \`/bump\`, I'll remind you when it's ready again.`),
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === 'removebot') {
            const bot = interaction.options.getUser('bot', true);
            let removed = false;
            await store.update(guildId, (data) => {
                removed = Boolean(data.bots[bot.id]);
                delete data.bots[bot.id];
                delete data.pending[bot.id];
            });
            return interaction.reply({
                content: removed ? ok(`Stopped tracking ${bot}.`) : fail(`${bot} isn't a bot you added.`),
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === 'message') {
            const text = interaction.options.getString('text', true).trim();
            const reset = text.toLowerCase() === 'default';
            await store.update(guildId, (data) => { data.message = reset ? null : text; });
            return interaction.reply({
                content: ok(reset ? 'Reminder text reset to the default.' : `Reminder text set to: ${text}`),
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            });
        }

        const config = await store.get(guildId);
        const botIds = [...new Set([...Object.keys(BUILT_IN_BOTS), ...Object.keys(config.bots)])];
        const lines = botIds.map((id) => {
            const info = botInfo(config, id);
            const pending = config.pending[id];
            const when = pending && pending.dueAt > Date.now()
                ? `can bump <t:${Math.floor(pending.dueAt / 1000)}:R>`
                : 'ready to bump (or not bumped since setup)';
            return `• **${info.name}** (${info.cooldownMinutes / 60}h cooldown): ${when}`;
        });

        const where = config.channelId ? `<#${config.channelId}>` : 'the channel where the bump happened';
        const role = config.roleId ? `<@&${config.roleId}>` : 'nobody';
        return interaction.reply({
            content: `**Bump reminders: ${config.enabled ? 'on' : 'off (turn on with `/setup bumpreminder`)'}**\nReminders go to ${where} and ping ${role}.\n${lines.join('\n')}`,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    },
};
