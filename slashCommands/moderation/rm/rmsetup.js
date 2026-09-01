const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ROLE_NAME = 'Reaction Muted';

function guildDir(guildId) {
    return path.join(DATA_DIR, String(guildId));
}

function reactionMuteConfigPath(guildId) {
    return path.join(guildDir(guildId), 'reactionmute.json');
}

async function ensureGuildDirExists(guildId) {
    await fs.mkdir(guildDir(guildId), { recursive: true });
}

async function writeReactionMuteConfig(guildId, data) {
    await ensureGuildDirExists(guildId);

    await fs.writeFile(
        reactionMuteConfigPath(guildId),
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

async function reactMuteConfigExists(guildId) {
    try {
        await fs.access(reactionMuteConfigPath(guildId));
        return true;
    } catch {
        return false;
    }
}

async function readReactionMuteConfig(guildId) {
    try {
        const data = await fs.readFile(reactionMuteConfigPath(guildId), 'utf8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rmsetup')
        .setDescription('Set up reaction mute')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const guild = interaction.guild;

        // Check if already setup
        const alreadySetup = await reactMuteConfigExists(guild.id);
        if (alreadySetup) {
            const config = await readReactionMuteConfig(guild.id);
            const setupUser = await guild.client.users.fetch(config.setupBy).catch(() => null);
            const setupByTag = setupUser ? setupUser.tag : 'Unknown user';

            return interaction.reply({
                content:
                    `# ⚠️ Reaction mute is already set up.\n` +
                    `Role: **${config.roleName}** (ID: ${config.roleId})\n` +
                    `Set up by: **${setupByTag}**\n` +
                    `Set up at: <t:${Math.floor(config.setupAt / 1000)}:R>\n` +
                    `Use \`/reactionmute\` or \`/unreactionmute\` to manage it. <:smirk2:1498272372539785286>`,
                ephemeral: true
            });
        }

        const me = guild.members.me;

        if (!me) {
            return interaction.reply({
                content: 'I could not verify my own permissions. <:smirk2:1498272372539785286>',
                ephemeral: true
            });
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: 'I need the **Manage Roles** permission to create the reaction mute role. <:smirk2:1498272372539785286>',
                ephemeral: true
            });
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'I need the **Manage Channels** permission to apply reaction restrictions to channels. <:smirk2:1498272372539785286>',
                ephemeral: true
            });
        }

        let role = guild.roles.cache.find((role) => role.name === ROLE_NAME);

        try {
            if (!role) {
                role = await guild.roles.create({
                    name: ROLE_NAME,
                    permissions: [],
                    reason: `Reaction mute setup requested by ${interaction.user.tag}`
                });
            }

            let updatedChannels = 0;

            for (const channel of guild.channels.cache.values()) {
                if (!channel.permissionOverwrites) continue;

                await channel.permissionOverwrites.edit(
                    role,
                    { AddReactions: false },
                    { reason: `Reaction mute setup requested by ${interaction.user.tag}` }
                );

                updatedChannels++;
            }

            await writeReactionMuteConfig(guild.id, {
                roleId: role.id,
                roleName: role.name,
                setupBy: interaction.user.id,
                setupAt: Date.now()
            });

            return interaction.reply({
                content:
                    `# ✅ Reaction mute setup complete.\n` +
                    `Role: **${role.name}**\n` +
                    `Updated channels: **${updatedChannels}**\n` +
                    `Reaction mutes are now ready to use.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('rmsetup error:', error);

            return interaction.reply({
                content: 'There was an error setting up reaction muting. Make sure my role is high enough to manage the new role and channel overwrites.',
                ephemeral: true
            });
        }
    }
};
