const { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const settings = require('../../settings');
const { DEFAULT_PREFIX, MAX_LENGTH, getPrefix } = require('../../prefix');
const { ok, fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('View or change the prefix for message commands')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addSubcommand((sub) => sub.setName('view').setDescription('Show the current prefix'))
        .addSubcommand((sub) =>
            sub.setName('set').setDescription('Change the prefix (needs Manage Server)')
                .addStringOption((opt) =>
                    opt.setName('prefix').setDescription(`New prefix, 1-${MAX_LENGTH} characters with no spaces`).setRequired(true).setMaxLength(MAX_LENGTH)))
        .addSubcommand((sub) => sub.setName('reset').setDescription(`Go back to the default prefix (${DEFAULT_PREFIX})`)),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'view') {
            const prefix = getPrefix(guildId);
            return interaction.reply({
                content: `The prefix here is \`${prefix}\`, like \`${prefix}help\`.${prefix === DEFAULT_PREFIX ? '' : ` (default: \`${DEFAULT_PREFIX}\`)`}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: fail('You need the `Manage Server` permission to change the prefix.'), flags: MessageFlags.Ephemeral });
        }

        const wanted = sub === 'reset' ? DEFAULT_PREFIX : interaction.options.getString('prefix', true);
        try {
            const { prefix } = await settings.updateSection(guildId, 'general', { prefix: wanted }, { id: interaction.user.id, source: 'slash' });
            return interaction.reply({
                content: ok(sub === 'reset' ? `Prefix reset to \`${prefix}\`.` : `Prefix changed to \`${prefix}\`. Try \`${prefix}help\`.`),
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            if (error.name !== 'SettingsError') throw error;
            return interaction.reply({ content: fail(error.message), flags: MessageFlags.Ephemeral });
        }
    },
};
