const { getJailConfig, unjailUser, getJailedUser } = require('../../../jailHandler');
const { logJail, logUnjail} = require('../../../log');

async function doUnjail(guild, userId, config) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    const savedRolesStr = await unjailUser(guild.id, userId);
    const savedRoles = savedRolesStr ? savedRolesStr.split(',').filter(Boolean) : [];

    const rolesToRestore = savedRoles.filter(id => guild.roles.cache.has(id));
    await member.roles.set(rolesToRestore, 'Unjailed');

    return member;
}

module.exports = {
    name: 'unjail',
    doUnjail,
    async execute(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply('You need the **Moderate Members** permission to run this.');
        }

        const guild = message.guild;
        const config = await getJailConfig(guild.id);
        if (!config) return message.reply('Jail system is not set up.');

        const mentionedMember = message.mentions.members.first();
        const target = mentionedMember || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
        if (!target) return message.reply('Could not find that user.');

        const jailedUser = await getJailedUser(guild.id, target.id);
        if (!jailedUser) return message.reply('That user is not jailed.');

        const success = await doUnjail(guild, target.id, config);
        if (!success) return message.reply('Could not find that member in the server.');

        await logUnjail(null, guild, target, message.member, false);
        await message.reply(`✅ **${target.user.tag}** has been unjailed.`);
    }
};