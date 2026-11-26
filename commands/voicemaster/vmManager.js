const { currentPrefix } = require('../../prefix');
const fs = require('fs');
const { ManagedChannelMap, loadManagedChannels } = require('../../voicemasterStore');
const path = require('path');
const { writeJsonAtomic } = require('../../jsonStore');
const { DATA_DIR: PROJECT_DATA_DIR, ASSETS_DIR: PROJECT_ASSETS_DIR } = require('../../paths');
const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');

const dataDir = PROJECT_DATA_DIR;
const OWNER_GRACE_MS = 5 * 60 * 1000;
const JOIN_TO_CREATE_NAME = 'Join to create';
const COPY_CHANNEL_ID_GIF = path.join(PROJECT_ASSETS_DIR, 'copychannelid.gif');

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
            channels: new ManagedChannelMap(),
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
    await writeJsonAtomic(configPath(guildId), config);
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

function buildVoiceMasterPanel(channelId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`vm:lock:${channelId}`)
                .setEmoji('🔒')
                .setLabel('Lock VC')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`vm:rename:${channelId}`)
                .setEmoji('✏️')
                .setLabel('Rename VC')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`vm:limit:${channelId}`)
                .setEmoji('👥')
                .setLabel('Set Limit')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`vm:delete:${channelId}`)
                .setEmoji('🗑️')
                .setLabel('Delete VC')
                .setStyle(ButtonStyle.Danger),
        ),
    ];
}

async function getManagedInteractionTarget(interaction, channelId) {
    const managed = getManagedChannel(interaction.client, channelId);

    if (!managed) {
        await interaction.reply({
            content: 'That VoiceMaster VC no longer exists or is not managed by me.',
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }

    const member = interaction.member;

    if (!isVoiceMasterOrStaff(member, managed)) {
        await interaction.reply({
            content: 'Only the VC owner or staff with **Manage Channels** can use this control panel.',
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildVoice) {
        await interaction.reply({
            content: 'I could not find that voice channel anymore.',
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }

    return {
        managed,
        channel,
    };
}

async function handleVoiceMasterButton(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('vm:')) return false;

    const [, action, channelId] = interaction.customId.split(':');
    const target = await getManagedInteractionTarget(interaction, channelId);
    if (!target) return true;

    const { channel } = target;

    if (action === 'lock') {
        const everyoneOverwrite = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const isLocked = everyoneOverwrite?.deny.has(PermissionsBitField.Flags.Connect) ?? false;

        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: isLocked ? null : false,
            ViewChannel: true,
        }, {
            reason: `VoiceMaster ${isLocked ? 'unlock' : 'lock'} by ${interaction.user.tag}`,
        });

        await interaction.reply({
            content: isLocked ? '🔓 Your VC has been unlocked.' : '🔒 Your VC has been locked.',
            flags: MessageFlags.Ephemeral,
        });

        return true;
    }

    if (action === 'rename') {
        const modal = new ModalBuilder()
            .setCustomId(`vm_modal:rename:${channelId}`)
            .setTitle('Rename your VC');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('New VC name')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setPlaceholder(`${interaction.member.displayName}'s VC`)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
        );

        await interaction.showModal(modal);
        return true;
    }

    if (action === 'limit') {
        const modal = new ModalBuilder()
            .setCustomId(`vm_modal:limit:${channelId}`)
            .setTitle('Set VC user limit');

        const limitInput = new TextInputBuilder()
            .setCustomId('limit')
            .setLabel('User limit')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(2)
            .setPlaceholder('0 for no limit, or 2-99')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(limitInput),
        );

        await interaction.showModal(modal);
        return true;
    }

    if (action === 'delete') {
        await interaction.reply({
            content: '🗑️ Deleting your VoiceMaster VC...',
            flags: MessageFlags.Ephemeral,
        });

        await deleteManagedChannel(
            interaction.client,
            channelId,
            `VoiceMaster VC deleted by ${interaction.user.tag}`,
        );

        return true;
    }

    return false;
}

async function handleVoiceMasterModal(interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('vm_modal:')) return false;

    const [, action, channelId] = interaction.customId.split(':');
    const target = await getManagedInteractionTarget(interaction, channelId);
    if (!target) return true;

    const { channel } = target;

    if (action === 'rename') {
        const name = interaction.fields.getTextInputValue('name').trim();

        if (!name) {
            await interaction.reply({
                content: 'Please enter a valid VC name.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        await channel.setName(name, `VoiceMaster rename by ${interaction.user.tag}`);

        await interaction.reply({
            content: `✏️ Your VC has been renamed to **${name}**.`,
            flags: MessageFlags.Ephemeral,
        });

        return true;
    }

    if (action === 'limit') {
        const rawLimit = interaction.fields.getTextInputValue('limit').trim();
        const limit = Number(rawLimit);

        if (!Number.isInteger(limit) || limit < 0 || limit > 99 || limit === 1) {
            await interaction.reply({
                content: 'Please enter `0` for no limit, or a number from `2` to `99`.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        await channel.setUserLimit(limit, `VoiceMaster limit changed by ${interaction.user.tag}`);

        await interaction.reply({
            content: limit === 0
                ? '👥 Your VC user limit has been removed.'
                : `👥 Your VC user limit has been set to **${limit}**.`,
            flags: MessageFlags.Ephemeral,
        });

        return true;
    }

    return false;
}

async function handleVoiceMasterInteraction(interaction) {
    if (await handleVoiceMasterButton(interaction)) return true;
    if (await handleVoiceMasterModal(interaction)) return true;

    return false;
}

async function askForCategoryId(message) {
    const prompt = {
        content:
            'Please enter the **category ID** where the `Join to create` channel should be created.\n' +
            'Type `cancel` to cancel setup.\n' +
            '-# If you do not see the **Copy Category ID** option, you may need to enable Developer Mode in your Discord settings.',
    };

    if (fs.existsSync(COPY_CHANNEL_ID_GIF)) {
        prompt.files = [
            new AttachmentBuilder(COPY_CHANNEL_ID_GIF, {
                name: 'copychannelid.gif',
            }),
        ];
    }

    await message.reply(prompt);

    const collected = await message.channel.awaitMessages({
        filter: (response) => response.author.id === message.author.id,
        max: 1,
        time: 60_000,
        errors: ['time'],
    }).catch(() => null);

    const response = collected?.first();
    if (!response) {
        await message.reply('VoiceMaster setup timed out.');
        return null;
    }

    const categoryId = response.content.trim();

    if (categoryId.toLowerCase() === 'cancel') {
        await message.reply('VoiceMaster setup cancelled.');
        return null;
    }

    return categoryId;
}

const SMIRK = '<:smirk2:1498272372539785286>';

async function createJoinChannel(client, guild, category, actorTag) {
    const me = guild.members.me;
    if (!me) return { error: `Could not verify my permissions. ${SMIRK}` };

    const existingConfig = await getConfig(client, guild.id);
    if (existingConfig.joinChannelId) {
        const existingChannel = guild.channels.cache.get(existingConfig.joinChannelId)
            ?? await guild.channels.fetch(existingConfig.joinChannelId).catch(() => null);
        if (existingChannel) {
            return { error: `VoiceMaster is already set up: ${existingChannel}. Remove it first (\`/disable voicemaster\` or \`${currentPrefix()}unsetupvm\`) to move it. ${SMIRK}` };
        }
    }

    if (!category || category.type !== ChannelType.GuildCategory) {
        return { error: 'That is not a valid category.' };
    }

    if (!category.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageChannels)) {
        return { error: `I need **Manage Channels** permission in that category. ${SMIRK}` };
    }

    const joinChannel = await guild.channels.create({
        name: JOIN_TO_CREATE_NAME,
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: `VoiceMaster setup by ${actorTag}`,
    });

    await setConfig(client, guild.id, { joinChannelId: joinChannel.id, categoryId: category.id });
    return { joinChannel };
}

async function removeVoiceMaster(client, guild, actorTag) {
    const state = ensureState(client);
    const config = await getConfig(client, guild.id);
    if (!config.joinChannelId) return false;

    const reason = `VoiceMaster unsetup by ${actorTag}`;
    const joinChannel = guild.channels.cache.get(config.joinChannelId)
        ?? await guild.channels.fetch(config.joinChannelId).catch(() => null);
    if (joinChannel) await joinChannel.delete(reason).catch(() => null);

    for (const [channelId, managed] of [...state.channels.entries()]) {
        if (managed.guildId !== guild.id) continue;
        await deleteManagedChannel(client, channelId, reason);
    }

    state.configs.delete(guild.id);
    await deleteConfig(guild.id);
    return true;
}

async function setupVoiceMaster(message) {
    const me = message.guild.members.me;
    if (!me) return message.reply(`Could not verify my permissions. ${SMIRK}`);

    if (!message.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply(`I need **Manage Channels** permission to set up VoiceMaster. ${SMIRK}`);
    }

    const existingConfig = await getConfig(message.client, message.guild.id);
    if (existingConfig.joinChannelId && message.guild.channels.cache.has(existingConfig.joinChannelId)) {
        const P = currentPrefix();
        return message.reply(
            `VoiceMaster is already set up: <#${existingConfig.joinChannelId}>. Use \`${P}lvc\`, \`${P}dvc\`, \`${P}kvc\`, \`${P}rmvc\`, or \`${P}unsetupvm\` to manage it. ${SMIRK}`
        );
    }

    const categoryId = await askForCategoryId(message);
    if (!categoryId) return;

    const result = await createJoinChannel(message.client, message.guild, message.guild.channels.cache.get(categoryId), message.author.tag);
    if (result.error) return message.reply(result.error);

    return message.reply(`VoiceMaster has been set up. Users can join ${result.joinChannel} to create a temporary VC.`);
}

async function unsetupVoiceMaster(message) {
    const removed = await removeVoiceMaster(message.client, message.guild, message.author.tag);
    return message.reply(removed
        ? 'VoiceMaster has been unsetup, its temporary VCs were deleted, and its configuration was removed.'
        : 'VoiceMaster is not currently set up on this server.');
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

    const P = currentPrefix();

    try {
        await member.voice.setChannel(channel, '✅ VoiceMaster temporary VC created');

        if (channel.isTextBased?.()) {
            await channel.send({
                content:
                    `Hi ${member}, your VoiceMaster VC has been created!\n\n` +
                    '**Control Panel:**\n' +
                    'Use the buttons below to manage your VC.\n\n' +
                    '**Commands still work too:**\n' +
                    `\` ${P}lvc \` - Lock/unlock your VC\n` +
                    `\` ${P}dvc \` - Delete your VC\n` +
                    `\` ${P}kvc @user \` - Kick someone from your VC\n` +
                    `\` ${P}sl [0/2-99] \` - Set user limit, or remove it with \`${P}sl\` / \`${P}sl 0\`\n` +
                    `\` ${P}rmvc new name \` - Rename your VC\n\n` +
                    'Server staff with the **Manage Channels** can also use these controls.',
                components: buildVoiceMasterPanel(channel.id),
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

    scheduleOwnerLeaveCheck(client, oldChannelId, managed);
}

function scheduleOwnerLeaveCheck(client, channelId, managed) {
    const state = ensureState(client);

    const existingTimer = state.ownerLeaveTimers.get(channelId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
        const latest = await client.channels.fetch(channelId).catch(() => null);

        if (!latest) {
            state.channels.delete(channelId);
            state.ownerLeaveTimers.delete(channelId);
            return;
        }

        state.ownerLeaveTimers.delete(channelId);
        const current = state.channels.get(channelId) ?? managed;
        if (latest.members?.has(current.ownerId)) return;

        const heir = latest.members?.find(member => !member.user.bot);
        if (heir) {
            await transferOwnership(client, latest, current, heir).catch((error) => {
                console.error('VoiceMaster ownership transfer failed:', error);
            });
            return;
        }

        await deleteManagedChannel(client, channelId, 'VoiceMaster owner left for more than 5 minutes');
    }, OWNER_GRACE_MS);

    state.ownerLeaveTimers.set(channelId, timer);
}

const OWNER_PERMISSIONS = { Connect: true, ViewChannel: true, ManageChannels: true, MoveMembers: true };

async function transferOwnership(client, channel, managed, newOwner) {
    const state = ensureState(client);
    const previousOwnerId = managed.ownerId;

    state.channels.set(channel.id, { ...managed, ownerId: newOwner.id });

    await channel.permissionOverwrites.edit(newOwner.id, OWNER_PERMISSIONS, { reason: 'VoiceMaster owner left, transferring ownership' });
    await channel.permissionOverwrites.delete(previousOwnerId, 'VoiceMaster ownership transferred').catch(() => null);

    if (channel.isTextBased?.()) {
        await channel.send({
            content: `👑 <@${previousOwnerId}> has been gone for a while, so ${newOwner} now owns this VC and can use the control panel.`,
            allowedMentions: { users: [newOwner.id] },
        }).catch(() => null);
    }
}

async function restoreManagedChannels(client) {
    const state = ensureState(client);

    for (const entry of loadManagedChannels()) {
        const channel = await client.channels.fetch(entry.channelId).catch(() => null);
        if (!channel) continue;

        state.channels.set(entry.channelId, entry);

        if (channel.members.size === 0) {
            await deleteManagedChannel(client, entry.channelId, 'VoiceMaster temporary VC was empty after a restart');
        } else if (!channel.members.has(entry.ownerId)) {
            scheduleOwnerLeaveCheck(client, entry.channelId, entry);
        }
    }

    state.channels.save();
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
    createJoinChannel,
    removeVoiceMaster,
    getManagedChannel,
    isManagedChannel,
    isVoiceMasterOrStaff,
    deleteManagedChannel,
    handleVoiceStateUpdate,
    handleVoiceMasterInteraction,
    restoreManagedChannels,
};
