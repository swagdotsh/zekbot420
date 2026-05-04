const { getJailConfig, jailUser, getJailedUser } = require('../../../jailHandler');
const { logJail } = require('../../../log');

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)(m|h|d)$/);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit = match[2];
    if (unit === 'm') return amount * 60 * 1000;
    if (unit === 'h') return amount * 60 * 60 * 1000;
    if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
    return null;
}

function formatDuration(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

module.exports = {
    name: 'jail',
    async execute(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply('You need the **Moderate Members** permission to run this.');
        }

        const guild = message.guild;
        const config = await getJailConfig(guild.id);
        if (!config) return message.reply('Jail system is not set up. Run `,setupjail` first.');

        const mentionedMember = message.mentions.members.first();
        const target = mentionedMember || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
        if (!target) return message.reply('Could not find that user.');
        if (target.id === message.author.id) return message.reply("You can't jail yourself.");
        if (target.permissions.has('ManageGuild')) return message.reply("You can't jail an admin.");

        const alreadyJailed = await getJailedUser(guild.id, target.id);
        if (alreadyJailed) return message.reply('That user is already jailed.');

        const durationArg = args[1];
        const durationMs = parseDuration(durationArg);
        const expiresAt = durationMs ? Date.now() + durationMs : null;

        const jailRole = guild.roles.cache.get(config.jail_role_id);
        const jailChannel = guild.channels.cache.get(config.jail_channel_id);
        if (!jailRole || !jailChannel) return message.reply('Jail role or channel is missing. Re-run `,setupjail`.');

        const savedRoles = target.roles.cache
            .filter(r => r.id !== guild.roles.everyone.id)
            .map(r => r.id)
            .join(',');

        await target.roles.set([jailRole], 'Jailed by ' + message.author.tag);
        await jailUser(guild.id, target.id, savedRoles, expiresAt);
        await logJail(null, guild, target, message.member, durationMs ? formatDuration(durationMs) : null);

        const durationText = durationMs ? ` for **${formatDuration(durationMs)}**` : ' indefinitely';

        await jailChannel.send({
            embeds: [{
                color: 0xff0000,
                description: `🔒 <@${target.id}>, you have been jailed${durationText} by **${message.author.tag}**.`
            }]
        });

        await message.reply(`✅ **${target.user.tag}** has been jailed${durationText}.`);
    }
};