const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'nick',
    aliases: ['nickname'],
    async execute(message, args) {
        if (!message.guild) return;

        const mentionedMember = message.mentions.members.first();
        let target = message.member;
        let newNickname;

        if (!message.member.permissions.has(PermissionFlagsBits.ChangeNickname)) {
            return message.reply('You do not have permission to change your nickname.');
        }

        if (mentionedMember) {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return;

            target = mentionedMember;
            newNickname = args.slice(1).join(' ').trim();
        } else {
            newNickname = args.join(' ').trim();
        }

        if (!target.manageable) {
            return message.reply('I can’t change that nickname.');
        }

        try {
            await target.setNickname(newNickname || null);

            if (newNickname) {
                return message.reply(`Changed ${target.user.id === message.author.id ? 'your' : `${target.user.username}'s`} nickname to **${newNickname}**.`);
            }

            return message.reply(`Reset ${target.user.id === message.author.id ? 'your' : `${target.user.username}'s`} nickname.`);
        } catch (err) {
            console.error('Error changing nickname:', err);
            return message.reply('Something went wrong while changing that nickname.');
        }
    }
};