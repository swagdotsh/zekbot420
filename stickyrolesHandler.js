const { getStickyRolesEnabled, getUserStickyRoles, getStickyRoles, addUserStickyRole } = require('./stickyrolesDbHndlr');

module.exports = {
  async handle(client) {
    client.on('guildMemberAdd', async (member) => {
      try {
        const guildId = member.guild.id;

        // Check if sticky roles are enabled for this guild
        const enabled = await getStickyRolesEnabled(guildId);
        if (!enabled) return;

        // Check if user is banned
        const bans = await member.guild.bans.fetch().catch(() => null);
        if (bans?.has(member.id)) return;

        // Get user's sticky roles
        const stickyRoles = await getUserStickyRoles(guildId, member.id);

        if (stickyRoles.length === 0) return;

        // Try to restore roles
        for (const stickyRole of stickyRoles) {
          const role = member.guild.roles.cache.get(stickyRole.role_id);
          if (!role) continue;

          try {
            await member.roles.add(role);
          } catch (err) {
            console.error(`Failed to add sticky role ${role.id} to ${member.id}:`, err);
          }
        }

      } catch (error) {
        console.error('Sticky roles guildMemberAdd handler error:', error);
      }
    });

    // Track when users receive roles (to mark them as sticky)
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
      try {
        const guildId = newMember.guild.id;

        // Check if sticky roles are enabled for this guild
        const enabled = await getStickyRolesEnabled(guildId);
        if (!enabled) return;

         // Get newly added roles
         const newRoles = newMember.roles.cache.difference(oldMember.roles.cache);
         if (newRoles.size === 0) return;

         const stickyRolesList = await getStickyRoles(guildId);
         const stickyRoleIds = stickyRolesList.map(r => r.role_id);

        // For each newly added role, if it's in the sticky list, track it
        for (const [roleId] of newRoles) {
          if (stickyRoleIds.includes(roleId)) {
            await addUserStickyRole(guildId, newMember.id, roleId);
          }
        }

      } catch (error) {
        console.error('Sticky roles guildMemberUpdate handler error:', error);
      }
    });
  }
};

