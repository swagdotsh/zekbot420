const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'role',
    aliases: ['toggleRole', 'togglerole'],

    async execute(message, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('You need the `Manage Roles` permission to use this command. <:smirk2:1498272372539785286>');
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('I need the `Manage Roles` permission to do that. <:smirk2:1498272372539785286>');
        }

        const targetMember = message.mentions.members.first();

        if (!targetMember) {
            return message.reply(`Usage: \`${process.env.PREFIX || ','}role [user] [role]\``);
        }

        const roleInput = args.slice(1).join(' ');

        if (!roleInput) {
            return message.reply(`Usage: \`${process.env.PREFIX || ','}role [user] [role]\``);
        }

        const roleId = roleInput.replace(/[<@&>]/g, '');

        const role =
            message.guild.roles.cache.get(roleId) ||
            message.guild.roles.cache.find(r => r.name.toLowerCase() === roleInput.toLowerCase());

        if (!role) {
            return message.reply('I could not find that role. <:smirk2:1498272372539785286>');
        }

        if (role.managed) {
            return message.reply('I cannot manage that role because it is managed by an integration or bot. <:smirk2:1498272372539785286>');
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('I cannot manage that role because it is higher than or equal to my highest role. <:smirk2:1498272372539785286>');
        }

        if (
            message.member.id !== message.guild.ownerId &&
            role.position >= message.member.roles.highest.position
        ) {
            return message.reply('You cannot manage that role because it is higher than or equal to your highest role. <:smirk2:1498272372539785286>');
        }

        const hasRole = targetMember.roles.cache.has(role.id);

        if (hasRole) {
            await targetMember.roles.remove(role);
            return message.reply(`✅ Removed **${role.name}** from **${targetMember.user.tag}**.`);
        }

        await targetMember.roles.add(role);
        return message.reply(`✅ Gave **${role.name}** to **${targetMember.user.tag}**.`);
    },
};