// Helper file. Do not deploy.

const fs = require('fs');
const path = require('path');
const {
    ChannelType,
    PermissionsBitField,
} = require('discord.js');

const dataDir = path.resolve(process.cwd(), 'data');
const OWNER_GRACE_MS = 5 * 60 * 1000;
const JOIN_TO_CREATE_NAME = 'Join to create';

function guildDir(guildId) {
    return path.join(dataDir, String(guildId));
}

function configPath(guildId) {
    return path.join(guildDir(guildId), 'voicemaster.json');
}

function ensureState(client) {
    if (!client.voiceMaster) {
        client.voiceMaster = {
            configs: new Map(),
            channels: new Map(),
            ownerLeaveTimers: new Map(),
        };
    }

    return client.voiceMaster;
}

async function readConfig(guildId) {
    try {
        const file = configPath(guildId);

        if (!fs.existsSync(file)) {
            return {
                joinChannelId: null,
                categoryId: null,
            };
        }

        const raw = await fs.promises.readFile(file, 'utf8');

        if (!raw.trim()) {
            return {
                joinChannelId: null,
                categoryId: null,
            };
        }

        const parsed = JSON.parse(raw);

        return {
            joinChannelId: parsed.joinChannelId ?? null,
            categoryId: parsed.categoryId ?? null,
        };
    } catch {
        return {
            joinChannelId: null,
            categoryId: null,
        };
    }
}

async function writeConfig(guildId, config) {
    const dir = guildDir(guildId);

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(configPath(guildId), JSON.stringify(config, null, 2), 'utf8');
}

async function deleteConfig(guildId) {
    const file = configPath(guildId);

    if (fs.existsSync(file)) {
        await fs.promises.unlink(file);
    }
}

async function getConfig(client, guildId) {
    const state = ensureState(client);

    if (!state.configs.has(guildId)) {
        state.configs.set(guildId, await readConfig(guildId));
    }

    return state.configs.get(guildId);
}

async function setConfig(client, guildId, config) {
    const state = ensureState(client);

    state.configs.set(guildId, config);

    await writeConfig(guildId, config);
}

function getManagedChannel(client, channelId) {
    const state = ensureState(client);

    return state.channels.get(channelId) ?? null;
}

function isManagedChannel(client, channelId) {
    return Boolean(getManagedChannel(client, channelId));
}

function isVoiceMasterOrStaff(member, managed) {
    if (!member || !managed) return false;

    return (
        member.id === managed.ownerId ||
        member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    );
}

async function setupVoiceMaster(interaction) {
    const guild = interaction.guild;
    const me = guild.members.me;

    if (!me) {
        return interaction.reply({
            content: 'Could not verify my permissions. <:smirk2:1498272372539785286>',
            ephemeral: true,
        });
    }

    const botPerms = interaction.channel.permissionsFor(me);

    if (!botPerms?.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({
            content: 'I need **Manage Channels** permission to set up VoiceMaster. <:smirk2:1498272372539785286>',
            ephemeral: true,
        });
    }

    const existingConfig = await getConfig(interaction.client, guild.id);

    if (existingConfig.joinChannelId) {
        const existingChannel = guild.channels.cache.get(existingConfig.joinChannelId)
            ?? await guild.channels.fetch(existingConfig.joinChannelId).catch(() => null);

        if (existingChannel) {
            return interaction.reply({
                content: `VoiceMaster is already set up: ${existingChannel}. Use \`/lvc\`, \`/dvc\`, \`/kvc\`, \`/rmvc\`, or \`/unsetupvm\` to manage it. <:smirk2:1498272372539785286>`,
                ephemeral: true,
            });
        }
    }

    const category = interaction.options.getChannel('category');

    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({
            content: 'That is not a valid category.',
            ephemeral: true,
        });
    }

    const categoryPerms = category.permissionsFor(me);

    if (!categoryPerms?.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({
            content: 'I need **Manage Channels** permission in that category. <:smirk2:1498272372539785286>',
            ephemeral: true,
        });
    }

    const joinChannel = await guild.channels.create({
        name: JOIN_TO_CREATE_NAME,
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: `VoiceMaster setup by ${interaction.user.tag}`,
    });

    await setConfig(interaction.client, guild.id, {
        joinChannelId: joinChannel.id,
        categoryId: category.id,
    });

    return interaction.reply({
        content: `VoiceMaster has been set up. Users can join ${joinChannel} to create a temporary VC.`,
        ephemeral: true,
    });
}

async function unsetupVoiceMaster(interaction) {
    const guild = interaction.guild;
    const state = ensureState(interaction.client);
    const config = await getConfig(interaction.client, guild.id);

    if (!config.joinChannelId) {
        return interaction.reply({
            content: 'VoiceMaster is not currently set up on this server.',
            ephemeral: true,
        });
    }

    const joinChannel = guild.channels.cache.get(config.joinChannelId)
        ?? await guild.channels.fetch(config.joinChannelId).catch(() => null);

    if (joinChannel) {
        await joinChannel.delete(`VoiceMaster unsetup by ${interaction.user.tag}`).catch(() => null);
    }

    for (const [channelId, managed] of state.channels.entries()) {
        if (managed.guildId !== guild.id) continue;

        const timer = state.ownerLeaveTimers.get(channelId);

        if (timer) {
            clearTimeout(timer);
            state.ownerLeaveTimers.delete(channelId);
        }

        const channel = guild.channels.cache.get(channelId)
            ?? await guild.channels.fetch(channelId).catch(() => null);

        if (channel) {
            await channel.delete(`VoiceMaster unsetup by ${interaction.user.tag}`).catch(() => null);
        }

        state.channels.delete(channelId);
    }

    state.configs.delete(guild.id);

    await deleteConfig(guild.id);

    return interaction.reply({
        content: 'VoiceMaster has been unsetup and its configuration was deleted.',
        ephemeral: true,
    });
}

async function createManagedChannelForMember(oldState, newState) {
    const member = newState.member;
    const guild = newState.guild;
    const client = newState.client;

    if (!member || member.user.bot) return;

    const config = await getConfig(client, guild.id);

    if (!config.joinChannelId || newState.channelId !== config.joinChannelId) return;

    const me = guild.members.me;

    if (!me) return;

    const joinChannel = newState.channel;

    if (!joinChannel) return;

    const perms = joinChannel.permissionsFor(me);

    if (
        !perms?.has(PermissionsBitField.Flags.ManageChannels) ||
        !perms?.has(PermissionsBitField.Flags.MoveMembers) ||
        !perms?.has(PermissionsBitField.Flags.Connect)
    ) {
        return;
    }

    const state = ensureState(client);

    const channel = await guild.channels.create({
        name: `${member.displayName}'s VC`,
        type: ChannelType.GuildVoice,
        parent: config.categoryId ?? joinChannel.parentId ?? null,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                allow: [
                    PermissionsBitField.Flags.Connect,
                    PermissionsBitField.Flags.ViewChannel,
                ],
            },
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.Connect,
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.ManageChannels,
                    PermissionsBitField.Flags.MoveMembers,
                ],
            },
            {
                id: me.id,
                allow: [
                    PermissionsBitField.Flags.Connect,
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.ManageChannels,
                    PermissionsBitField.Flags.MoveMembers,
                ],
            },
        ],
        reason: `VoiceMaster temporary VC for ${member.user.tag}`,
    });

    state.channels.set(channel.id, {
        guildId: guild.id,
        channelId: channel.id,
        ownerId: member.id,
        createdAt: Date.now(),
    });

    try {
        await member.voice.setChannel(channel, '✅ VoiceMaster temporary VC created');

        if (channel.isTextBased?.()) {
            await channel.send({
                content:
                    `Hi ${member}, your VoiceMaster VC has been created!\n\n` +
                    '**Commands:**\n' +
                    '`/lvc` - Lock/unlock your VC\n' +
                    '`/dvc` - Delete your VC\n' +
                    '`/kvc user:@user` - Kick someone from your VC\n' +
                    '`/sl limit:0-99` - Set user limit, or remove it with `/sl` / `/sl limit:0`\n' +
                    '`/rmvc name:new name` - Rename your VC\n\n' +
                    'Server staff with the **Manage Channels** can also use these commands.',
                allowedMentions: {
                    users: [member.id],
                },
            }).catch(() => null);
        }
    } catch {
        state.channels.delete(channel.id);
        await channel.delete('VoiceMaster move failed').catch(() => null);
    }
}

async function deleteManagedChannel(client, channelId, reason = 'VoiceMaster temporary VC deleted') {
    const state = ensureState(client);
    const managed = state.channels.get(channelId);

    if (!managed) return false;

    const timer = state.ownerLeaveTimers.get(channelId);

    if (timer) {
        clearTimeout(timer);
        state.ownerLeaveTimers.delete(channelId);
    }

    state.channels.delete(channelId);

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (channel) {
        await channel.delete(reason).catch(() => null);
    }

    return true;
}

async function handleOwnerLeave(oldState, newState) {
    const client = oldState.client;
    const state = ensureState(client);
    const oldChannelId = oldState.channelId;

    if (!oldChannelId) return;

    const managed = state.channels.get(oldChannelId);

    if (!managed) return;

    if (oldState.member?.id !== managed.ownerId) return;

    if (newState.channelId === oldChannelId) return;

    const oldChannel = oldState.channel;

    if (!oldChannel) return;

    const existingTimer = state.ownerLeaveTimers.get(oldChannelId);

    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
        const latest = await client.channels.fetch(oldChannelId).catch(() => null);

        if (!latest) {
            state.channels.delete(oldChannelId);
            state.ownerLeaveTimers.delete(oldChannelId);
            return;
        }

        const ownerStillInside = latest.members?.has(managed.ownerId);

        if (!ownerStillInside) {
            await deleteManagedChannel(client, oldChannelId, 'VoiceMaster owner left for more than 5 minutes');
        } else {
            state.ownerLeaveTimers.delete(oldChannelId);
        }
    }, OWNER_GRACE_MS);

    state.ownerLeaveTimers.set(oldChannelId, timer);
}

async function handleOwnerReturn(oldState, newState) {
    const client = newState.client;
    const state = ensureState(client);
    const newChannelId = newState.channelId;

    if (!newChannelId) return;

    const managed = state.channels.get(newChannelId);

    if (!managed) return;

    if (newState.member?.id !== managed.ownerId) return;

    const timer = state.ownerLeaveTimers.get(newChannelId);

    if (!timer) return;

    clearTimeout(timer);
    state.ownerLeaveTimers.delete(newChannelId);
}

async function handleEmptyManagedChannel(oldState) {
    const client = oldState.client;
    const state = ensureState(client);
    const oldChannelId = oldState.channelId;

    if (!oldChannelId) return;

    const managed = state.channels.get(oldChannelId);

    if (!managed) return;

    const channel = oldState.channel;

    if (!channel) return;

    if (channel.members.size === 0) {
        await deleteManagedChannel(client, oldChannelId, 'VoiceMaster temporary VC became empty');
    }
}

async function handleVoiceStateUpdate(oldState, newState) {
    await createManagedChannelForMember(oldState, newState);
    await handleOwnerReturn(oldState, newState);
    await handleOwnerLeave(oldState, newState);
    await handleEmptyManagedChannel(oldState);
}

module.exports = {
    setupVoiceMaster,
    unsetupVoiceMaster,
    getManagedChannel,
    isManagedChannel,
    isVoiceMasterOrStaff,
    deleteManagedChannel,
    handleVoiceStateUpdate,
};
