const { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { setAuthorBan } = require('../../confessions');
const { ok, fail } = require('../../ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confession')
        .setDescription('Moderate anonymous confessions')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand((sub) =>
            sub.setName('ban').setDescription('Stop the author of a confession from confessing (stays anonymous)')
                .addStringOption((opt) => opt.setName('number').setDescription('Confession number, like 12, or a reply ID like r5').setRequired(true)))
        .addSubcommand((sub) =>
            sub.setName('unban').setDescription('Let the author of a confession confess again')
                .addStringOption((opt) => opt.setName('number').setDescription('Confession number, like 12, or a reply ID like r5').setRequired(true))),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: fail('You need the `Manage Messages` permission to use this.'), flags: MessageFlags.Ephemeral });
        }

        const ban = interaction.options.getSubcommand() === 'ban';
        const ref = interaction.options.getString('number', true);
        const { found, alreadyInState } = await setAuthorBan(interaction.guild.id, ref, ban);

        if (!found) {
            return interaction.reply({ content: fail(`There's no confession or reply \`${ref}\` in this server.`), flags: MessageFlags.Ephemeral });
        }
        if (alreadyInState) {
            return interaction.reply({ content: fail(`The author of \`${ref}\` is already ${ban ? 'banned' : 'allowed to confess'}.`), flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({
            content: ok(ban
                ? `The author of \`${ref}\` can no longer confess. Their identity stays hidden.`
                : `The author of \`${ref}\` can confess again.`),
            flags: MessageFlags.Ephemeral,
        });
    },
};
