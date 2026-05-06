const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType
} = require('discord.js');
const { getJailConfig, unjailUser, getJailedUser } = require('../../../jailHandler');
const { logUnjail } = require('../../../log');

async function doUnjail(guild, userId) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);

    if (!member) return false;

    const savedRolesStr = await unjailUser(guild.id, userId);
    const savedRoles = savedRolesStr ? savedRolesStr.split(',').filter(Boolean) : [];

    const rolesToRestore = savedRoles.filter((id) => guild.roles.cache.has(id));

    await member.roles.set(rolesToRestore, 'Unjailed');

    return member;
}

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
                ephemeral: true
            });
        }

        const config = await getJailConfig(guild.id);

        if (!config) {
            return interaction.reply({
                content: 'Jail system is not set up.',
                ephemeral: true
            });
        }

        const jailedUser = await getJailedUser(guild.id, target.id);

        if (!jailedUser) {
            return interaction.reply({
                content: 'That user is not jailed.',
                ephemeral: true
            });
        }

        const success = await doUnjail(guild, target.id);

        if (!success) {
            return interaction.reply({
                content: 'Could not find that member in the server.',
                ephemeral: true
            });
        }

        await logUnjail(null, guild, target, interaction.member, false);

        return interaction.reply(`✅ **${target.user.tag}** has been unjailed.`);
    }
};

module.exports.doUnjail = doUnjail;