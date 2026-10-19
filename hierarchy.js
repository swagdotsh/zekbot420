// Role hierarchy checks shared by moderation commands (prefix + slash)

// Can moderator act on target? Owner beats everyone, nobody beats the owner, otherwise top role must be strictly higher.
function canModerate(moderator, target) {
    const guild = target.guild;
    if (target.id === guild.ownerId) return false;
    if (moderator.id === guild.ownerId) return true;
    return moderator.roles.highest.position > target.roles.highest.position;
}

// Returns null if member can hand out role, otherwise the reason they can't
function roleAssignBlocker(member, role) {
    const guild = member.guild;
    if (role.managed || role.id === guild.roles.everyone.id) return 'That role is managed by Discord or an integration and can\'t be given out.';
    if (role.position >= guild.members.me.roles.highest.position) return 'That role is higher than or equal to my highest role.';
    if (member.id !== guild.ownerId && role.position >= member.roles.highest.position) return 'That role is higher than or equal to your highest role.';
    return null;
}

module.exports = { canModerate, roleAssignBlocker };
