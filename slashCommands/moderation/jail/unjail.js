const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    MessageFlags
} = require('discord.js');
const { getJailConfig, getJailedUser } = require('../../../jailHandler');
const { logUnjail } = require('../../../log');
const { doUnjail } = require('../../../commands/moderation/jail/unjail');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Unjail a member')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to unjail')
                .setRequired(true)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        const target = interaction.options.getMember('user');

        if (!target) {
            return interaction.reply({
                content: 'Could not find that user.',
                flags: MessageFlags.Ephemeral
            });
        }

        const config = await getJailConfig(guild.id);

        if (!config) {
            return interaction.reply({
                content: 'Jail system is not set up.',
                flags: MessageFlags.Ephemeral
            });
        }

        const jailedUser = await getJailedUser(guild.id, target.id);

        if (!jailedUser) {
            return interaction.reply({
                content: 'That user is not jailed.',
                flags: MessageFlags.Ephemeral
            });
        }

        const success = await doUnjail(guild, target.id);

        if (!success) {
            return interaction.reply({
                content: 'Could not find that member in the server.',
                flags: MessageFlags.Ephemeral
            });
        }

        await logUnjail(null, guild, target, interaction.member, false);

        return interaction.reply(`✅ **${target.user.tag}** has been unjailed.`);
    }
};

module.exports.doUnjail = doUnjail;