const { getJailConfig, unjailUser, getJailedUser } = require('../../../jailHandler');
const { logJail, logUnjail} = require('../../../log');

async function doUnjail(guild, userId, config) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    const jailed = await getJailedUser(guild.id, userId);
    const savedRoles = jailed?.saved_roles ? jailed.saved_roles.split(',').filter(Boolean) : [];

    const rolesToRestore = savedRoles.filter(id => guild.roles.cache.has(id) && !guild.roles.cache.get(id).managed);
    const keepManaged = member.roles.cache.filter(r => r.managed).map(r => r.id);
    await member.roles.set([...new Set([...rolesToRestore, ...keepManaged])], 'Unjailed');
    await unjailUser(guild.id, userId);

    return member;
}

module.exports = {
    name: 'unjail',
    doUnjail,
    async execute(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply('You need the **Moderate Members** permission to run this. <:smirk2:1498272372539785286>');
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
        await message.reply(`👍`);
    }
};
