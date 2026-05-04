const { setLevelRole, getLevelRoles } = require('../../leveling');

module.exports = {
    name: 'lvlrole',
    aliases: ['lvlroleset', 'levelrole', 'levelroleset', 'levelroleadd', 'levelroleremove', 'levelroleset'],
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('You need the **Manage Server** permission to run this.');
        }

        if (args[0] === 'list') {
            const roles = await getLevelRoles(message.guild.id);
            if (!roles.length) return message.reply('No level roles set up yet.');

            const list = roles.map(r => `Level ${r.level} → <@&${r.role_id}>`).join('\n');
            return message.reply({ embeds: [{ color: 0x5865f2, title: '🎖️ Level Roles', description: list }] });
        }

        const level = parseInt(args[0]);
        const roleId = args[1]?.replace(/[<@&>]/g, '');
        const role = message.guild.roles.cache.get(roleId);

        if (isNaN(level) || level < 1) return message.reply('Please provide a valid level number.');
        if (!role) return message.reply('Please mention a valid role.');

        try {
            await setLevelRole(message.guild.id, level, roleId);
            await message.reply(`<@&${roleId}> will now be assigned when a user reaches level **${level}**.`);
        } catch (err) {
            console.error(err);
            await message.reply('Something went wrong saving the role.');
        }
    }
};