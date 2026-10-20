function canModerate(moderator, target) {
    const guild = target.guild;
    if (target.id === guild.ownerId) return false;
    if (moderator.id === guild.ownerId) return true;
    return moderator.roles.highest.position > target.roles.highest.position;
}

function roleAssignBlocker(member, role) {
    const guild = member.guild;
    if (role.managed || role.id === guild.roles.everyone.id) return 'That role is managed by Discord or an integration and can\'t be given out.';
    if (role.position >= guild.members.me.roles.highest.position) return 'That role is higher than or equal to my highest role.';
    if (member.id !== guild.ownerId && role.position >= member.roles.highest.position) return 'That role is higher than or equal to your highest role.';
    return null;
}

module.exports = { canModerate, roleAssignBlocker };
