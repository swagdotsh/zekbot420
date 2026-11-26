const fs = require('fs');
const path = require('path');
const {
    AuditLogEvent,
    AutoModerationActionType,
    Client,
    GatewayIntentBits,
    Collection,
    Partials,
    MessageFlags
} = require('discord.js');

require('dotenv').config();

const missingRuntimeConfig = ['TOKEN', 'NEON_DATABASE_URL']
    .filter((name) => !process.env[name]);

if (missingRuntimeConfig.length) {
    throw new Error(`Missing required environment variable(s): ${missingRuntimeConfig.join(', ')}`);
}

const {
    logMessageDeletion,
    logMessageEdit,
    logMemberJoin,
    logMemberLeave,
    logChannelCreate,
    logChannelDelete,
    logRoleCreate,
    logRoleUpdate,
    logMemberRoleUpdate,
    logMemberProfileUpdate,
    logUserProfileUpdate,
    logTimeout,
    logUntimeout,
} = require('./log');

const {
    handleVoiceStateUpdate,
    handleVoiceMasterInteraction,
    restoreManagedChannels,
} = require('./commands/voicemaster/vmManager');
const {initDB, flushXp} = require('./leveling');
const {sql} = require('./db');
const {initJailDB} = require('./jailHandler');
const {initStickyRoleDB} = require('./stickyrolesDbHndlr');
const {handleMessageXP} = require('./events/xpHandler');
const {handleVoiceXPStateUpdate, startVcXPLoop} = require('./events/VCxpHandler');
const {startJailExpiryLoop} = require('./events/jailExpiryLoop');
const {handleAfkMessage, initAfkDB} = require('./events/afkStore');
const {initRemindersDB, startReminderLoop} = require('./reminders');
const {handleTrapMessage} = require('./events/trapHelper');
const {startBirthdayLoop} = require('./events/birthdayManager');
const {initNflDB} = require('./nflHandler');
const {startNflPlayLoop} = require('./events/nflPlayLoop');
const {startNbaGameLoop} = require('./events/nbaGameLoop');
const {initTtsDB, handleTtsMessage} = require('./ttsHandler');
const {handleMusicButton} = require('./musicControls');
const {initTicketDB, handleTicketInteraction, markDeletedTicket, noteOpenerLeft} = require('./ticketHandler');
const {teardownSession} = require('./musicPlayer');
const {isConnectionAlive} = require('./voiceConnection');

const {handle: handleStickyRoles} = require('./stickyrolesHandler');
const {loadSlashCommands} = require('./slashLoader');
const {initPrefixes, getPrefix, runWithPrefix} = require('./prefix');
const {handleSocialEmbed} = require('./socialEmbeds');
const {gatewayPlatformOptions} = require('./platformIcon');
const {handleConfessionInteraction} = require('./confessions');
const {handleBumpMessage, startBumpReminderLoop} = require('./bumpReminders');
const {handleVcBanVoiceState, startVcBanLoop} = require('./vcBans');
const {registerBoostEvents, handleBoostSystemMessage, syncPerks} = require('./boosts');
const {registerReactionRoleEvents} = require('./reactionRoles');
const {registerColorRoleEvents} = require('./colorRoles');
const {handleStreakMessage} = require('./streaks');
const {showLoadingOnDefer} = require('./ui');

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.AutoModerationExecution
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    ws: gatewayPlatformOptions(),
});

let dashboardServer = null;

client.commands = new Collection();
client.slashCommands = new Collection();
client.snipes = new Map();
client.editSnipes = new Map();
client.reactionSnipes = new Map();

const EMPTY_VC_GRACE_MS = 15*1000; // 15 seconds then the bot leaves IF its playing music

function voiceChannelHasNonBotMembers(channel) {
    return channel?.members?.some(member => !member.user.bot) ?? false;
}

async function cleanupEmptyVoiceSession(client, guildId, channelId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session) return;

    const sessionChannelId = session.connection?.joinConfig?.channelId;
    if (!sessionChannelId || sessionChannelId !== channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || voiceChannelHasNonBotMembers(channel)) return;

    if (session.mode === 'tts') {
        if (session.emptyVoiceTimeout) clearTimeout(session.emptyVoiceTimeout);
        client.voiceSessions.delete(guildId);
        session.player?.stop(true);
        if (isConnectionAlive(session.connection)) session.connection.destroy();
    } else {
        teardownSession(client, guildId, session);
    }

    const textChannel = session.textChannelId
        ? await client.channels.fetch(session.textChannelId).catch(() => null)
        : null;

    if (textChannel?.isTextBased()) {
        await textChannel.send('Left voice channel because everyone left.').catch(() => {});
    }
}

function scheduleEmptyVoiceSessionCleanup(client, guildId, channelId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session) return;

    const sessionChannelId = session.connection?.joinConfig?.channelId;
    if (sessionChannelId !== channelId) return;

    if (session.emptyVoiceTimeout) clearTimeout(session.emptyVoiceTimeout);

    session.emptyVoiceTimeout = setTimeout(() => {
        cleanupEmptyVoiceSession(client, guildId, channelId).catch(console.error);
    }, EMPTY_VC_GRACE_MS);
}

function clearEmptyVoiceSessionCleanup(client, guildId) {
    const session = client.voiceSessions?.get(guildId);
    if (!session?.emptyVoiceTimeout) return;

    clearTimeout(session.emptyVoiceTimeout);
    session.emptyVoiceTimeout = null;
}

async function getRecentMemberUpdateAuditEntry(guild, targetId) {
    try {
        const logs = await guild.fetchAuditLogs({
            type: AuditLogEvent.MemberUpdate,
            limit: 6,
        });

        const entry = logs.entries.find(auditEntry => {
            const isTarget = auditEntry.target?.id === targetId;
            const isRecent = Date.now() - auditEntry.createdTimestamp < 10 * 1000;
            return isTarget && isRecent;
        });

        return entry ?? null;
    } catch {
        return null;
    }
}

function formatTimeoutDuration(untilTimestamp) {
    const remainingMs = untilTimestamp - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Expired';

    const minutes = Math.ceil(remainingMs / 60000);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

    const days = Math.ceil(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
}

function formatTimeoutSeconds(durationSeconds) {
    const seconds = Number(durationSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown';
    return formatTimeoutDuration(Date.now() + seconds * 1000);
}

const recentAutoModTimeouts = new Map();

function autoModTimeoutKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

async function logTimeoutChange(client, oldMember, newMember) {
    const oldUntil = oldMember?.communicationDisabledUntilTimestamp ?? null;
    const newUntil = newMember?.communicationDisabledUntilTimestamp ?? null;

    if (oldUntil === newUntil) return;

    const guild = newMember?.guild ?? oldMember?.guild;
    const user = newMember?.user ?? oldMember?.user;
    if (!guild || !user) return;

    const timeoutKey = autoModTimeoutKey(guild.id, user.id);
    if (newUntil && newUntil > Date.now() && recentAutoModTimeouts.has(timeoutKey)) return;

    const auditEntry = await getRecentMemberUpdateAuditEntry(guild, newMember.id);
    const executor = auditEntry?.executor ?? guild.client.user;

    if (newUntil && newUntil > Date.now()) {
        recentAutoModTimeouts.set(timeoutKey, true);
        setTimeout(() => recentAutoModTimeouts.delete(timeoutKey), 15 * 1000);

        await logTimeout(
            client,
            guild,
            user,
            executor,
            auditEntry?.reason || 'No reason specified',
            formatTimeoutDuration(newUntil)
        );
        return;
    }

    if (oldUntil && (!newUntil || newUntil <= Date.now())) {
        await logUntimeout(
            client,
            guild,
            user,
            executor,
            'Timeout removed or expired.'
        );
    }
}

const DEFAULT_COOLDOWN_SECONDS = 2;
const commandCooldowns = new Map();

function checkCooldown(userId, commandName, cooldownSeconds = DEFAULT_COOLDOWN_SECONDS) {
    const key = `${userId}:${commandName}`;
    const now = Date.now();
    const entry = commandCooldowns.get(key);

    if (entry && now < entry.until) {
        const firstHit = !entry.warned;
        entry.warned = true;
        return { remaining: Math.ceil((entry.until - now) / 1000), warn: firstHit };
    }

    commandCooldowns.set(key, { until: now + cooldownSeconds * 1000, warned: false });
    return null;
}

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of commandCooldowns) if (entry.until < now) commandCooldowns.delete(key);
}, 60 * 1000).unref();

const commandsPath = path.join(__dirname, 'commands');

const loadCommands = (dir) => {
    const entries = fs.readdirSync(dir, {withFileTypes: true});

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            loadCommands(fullPath);
            continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

        const command = require(fullPath);
        if (!command?.name || typeof command.execute !== 'function') continue;
        client.commands.set(command.name, command);
    }
};

loadCommands(commandsPath);

for (const slashCommand of loadSlashCommands()) {
    client.slashCommands.set(slashCommand.data.name, slashCommand);
}

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('the national football league', {type: 3}); // watching [...]
    startBumpReminderLoop(client);
    startVcBanLoop();
    syncPerks(client).catch((error) => console.error('Failed to sync booster perks:', error));
    require('./settings').setClient(client);
    if (process.env.DASHBOARD_PORT) dashboardServer = require('./dashboard/server').start(client);
    await initDB();
    await initJailDB();
    await initStickyRoleDB();
    await initNflDB();
    await initTtsDB();
    await initTicketDB();
    await initRemindersDB();
    await initAfkDB();
    await require('./events/giveawayManager').initGiveawayDB();
    startVcXPLoop(client);
    startJailExpiryLoop(client);
    startBirthdayLoop(client);
    startNflPlayLoop(client);
    startNbaGameLoop(client);
    startReminderLoop(client);
    await restoreManagedChannels(client).catch((error) => console.error('Failed to restore VoiceMaster channels:', error));
    require('./events/welcoming')(client);
    require('./events/onJoin')(client);
    await require('./events/giveawayManager').execute(client); // LOL NO WAY THIS TOOK ME 3 MONTHS TO FIX
    await handleStickyRoles(client);

    console.log([...client.commands.keys()]);
});

// Slash commands, buttons, and modals
client.on('interactionCreate', async (interaction) => {
    try {
        if (await handleVoiceMasterInteraction(interaction)) return;
        if (await handleMusicButton(interaction)) return;
        if (await handleTicketInteraction(interaction)) return;
        if (await handleConfessionInteraction(interaction)) return;

        if (interaction.isAutocomplete()) {
            const cmd = client.slashCommands.get(interaction.commandName);
            if (cmd?.autocomplete) await cmd.autocomplete(interaction).catch(console.error);
            return;
        }

        if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

        const cmd = client.slashCommands.get(interaction.commandName);
        if (!cmd) return;

        const subcommand = interaction.isChatInputCommand()
            ? [interaction.options.getSubcommandGroup(false), interaction.options.getSubcommand(false)].filter(Boolean).join(' ')
            : '';
        const cooldown = checkCooldown(
            interaction.user.id,
            `/${interaction.commandName}${subcommand ? ` ${subcommand}` : ''}`,
            cmd.getCooldown?.(interaction) ?? cmd.cooldown
        );
        if (cooldown) {
            await interaction.reply({
                content: `Slow down! You can use that again in ${cooldown.remaining}s.`,
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
            return;
        }

        showLoadingOnDefer(interaction);
        await runWithPrefix(getPrefix(interaction.guildId), () => cmd.execute(interaction));
    } catch (error) {
        console.error(error);

        const payload = {
            content: 'Something went wrong running that. Try again in a moment.',
            flags: MessageFlags.Ephemeral,
        };

        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
});

// Prefix commands
client.on('messageCreate', async (message) => {
    if (message.author.bot && message.guild) handleBumpMessage(message).catch(console.error);
    if (message.system && message.guild) handleBoostSystemMessage(message).catch(console.error);

    if (!message.author.bot && message.guild) {
        await handleMessageXP(message).catch(console.error);
        await handleAfkMessage(message).catch(console.error);
        await handleTrapMessage(message).catch(console.error);
        await handleTtsMessage(message).catch(console.error);
        handleStreakMessage(message).catch(console.error);
        handleSocialEmbed(message).catch(console.error);
    }

    if (message.author.bot) return;

    const prefix = getPrefix(message.guild?.id);

    if (message.guild && new RegExp(`^<@!?${client.user.id}>$`).test(message.content.trim())) {
        await message.reply(`My prefix here is \`${prefix}\`, like \`${prefix}help\`. Slash commands work too.`).catch(() => {});
        return;
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.find(
        cmd => cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))
    );

    if (!command) return;

    const cooldown = checkCooldown(message.author.id, command.name, command.cooldown);
    if (cooldown) {
        if (cooldown.warn) {
            const notice = await message.reply(`Slow down! You can use that again in ${cooldown.remaining}s.`).catch(() => null);
            if (notice) setTimeout(() => notice.delete().catch(() => {}), 5000);
        }
        return;
    }

    try {
        message.prefix = prefix;
        await runWithPrefix(prefix, () => command.execute(message, args));
    } catch (error) {
        console.error(error);
        await message.reply('Something went wrong running that command. Try again in a moment.').catch(() => {});
    }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
        if (newMessage.partial) {
            newMessage = await newMessage.fetch().catch(() => null);
        }

        if (newMessage?.guild && newMessage.author?.bot) {
            await handleBumpMessage(newMessage).catch(console.error);
            return;
        }
        if (!newMessage?.guild || newMessage.author?.bot) return;

        if (oldMessage.partial) {
            oldMessage = await oldMessage.fetch().catch(() => null);
        }

        if (!oldMessage || oldMessage.author?.bot) return;

        const oldContent = oldMessage.content;
        const newContent = newMessage.content;

        if (typeof oldContent !== 'string' || typeof newContent !== 'string') return;
        if (!oldContent.length && !newContent.length) return;
        if (oldContent === newContent) return;

        client.editSnipes.set(newMessage.channel.id, {
            oldContent,
            newContent,
            user: newMessage.author,
            timestamp: Date.now(),
        });

        await logMessageEdit(client, oldMessage, newMessage);
    } catch (error) {
        console.error('Failed to log message edit:', error);
    }
});

client.on('guildMemberAdd', async member => {
    try {
        await logMemberJoin(client, member);
    } catch (error) {
        console.error('Failed to log member join:', error);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        await logTimeoutChange(client, oldMember, newMember);
        await logMemberRoleUpdate(client, oldMember, newMember);
        await logMemberProfileUpdate(client, oldMember, newMember);
    } catch (error) {
        console.error('Failed to log member update:', error);
    }
});

client.on('autoModerationActionExecution', async (execution) => {
    if (execution.action.type !== AutoModerationActionType.Timeout) return;

    const key = autoModTimeoutKey(execution.guild.id, execution.userId);
    if (recentAutoModTimeouts.has(key)) return;

    recentAutoModTimeouts.set(key, true);
    setTimeout(() => recentAutoModTimeouts.delete(key), 15 * 1000);

    try {
        const user = execution.user ?? await client.users.fetch(execution.userId).catch(() => null);
        if (!user) return;

        const ruleName = execution.autoModerationRule?.name ?? 'AutoMod rule';
        await logTimeout(
            client,
            execution.guild,
            user,
            client.user,
            `Triggered ${ruleName}.`,
            formatTimeoutSeconds(execution.action.metadata.durationSeconds)
        );
    } catch (error) {
        console.error('Failed to log AutoMod timeout:', error);
    }
});

client.on('userUpdate', async (oldUser, newUser) => {
    try {
        await logUserProfileUpdate(client, oldUser, newUser);
    } catch (error) {
        console.error('Failed to log user profile update:', error);
    }
});

client.on('guildMemberRemove', async member => {
    try {
        await noteOpenerLeft(member).catch(console.error);
        await logMemberLeave(client, member);
    } catch (error) {
        console.error('Failed to log member leave:', error);
    }
});

client.on('channelCreate', async channel => {
    try {
        if (!channel.guild) return;
        await logChannelCreate(client, channel);
    } catch (error) {
        console.error('Failed to log channel create:', error);
    }
});

client.on('channelDelete', async channel => {
    try {
        if (!channel.guild) return;
        await markDeletedTicket(channel.id).catch(console.error);
        await logChannelDelete(client, channel);
    } catch (error) {
        console.error('Failed to log channel delete:', error);
    }
});

client.on('roleCreate', async role => {
    try {
        await logRoleCreate(client, role);
    } catch (error) {
        console.error('Failed to log role create:', error);
    }
});

client.on('roleUpdate', async (oldRole, newRole) => {
    try {
        await logRoleUpdate(client, oldRole, newRole);
    } catch (error) {
        console.error('Failed to log role update:', error);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch {
            return;
        }
    }

    const channelId = reaction.message.channel.id;
    const snipe = {
        emoji: reaction.emoji.toString(),
        user: user.tag,
        message: reaction.message.content || '[no text]',
        messageAuthor: reaction.message.author?.tag || 'Unknown',
        time: Date.now()
    };

    client.reactionSnipes.set(channelId, snipe);

    setTimeout(() => {
        if (client.reactionSnipes.get(channelId) === snipe) client.reactionSnipes.delete(channelId);
    }, 60000);
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

initPrefixes()
    .catch((error) => console.error('Failed to load server prefixes, using the default:', error))
    .finally(() => client.login(process.env.TOKEN));

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, saving XP and shutting down...`);

    const forceExit = setTimeout(() => process.exit(1), 10 * 1000);
    try {
        await flushXp();
        require('./esmbotMedia').shutdownWorker();
        dashboardServer?.close();
    } catch (error) {
        console.error('Failed to save XP during shutdown:', error);
    }
    await client.destroy().catch(() => {});
    await sql.end({ timeout: 5 }).catch(() => {});
    clearTimeout(forceExit);
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
        console.error('VoiceMaster voiceStateUpdate failed:', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    await handleVcBanVoiceState(oldState, newState).catch(console.error);
    await handleVoiceXPStateUpdate(oldState, newState).catch(console.error);

    const leftChannel = oldState.channel;
    if (leftChannel) {
        if (voiceChannelHasNonBotMembers(leftChannel)) {
            clearEmptyVoiceSessionCleanup(client, oldState.guild.id);
        } else {
            scheduleEmptyVoiceSessionCleanup(client, oldState.guild.id, leftChannel.id);
        }
    }

    const joinedChannel = newState.channel;
    if (joinedChannel && voiceChannelHasNonBotMembers(joinedChannel)) {
        clearEmptyVoiceSessionCleanup(client, newState.guild.id);
    }
});

registerBoostEvents(client);
registerReactionRoleEvents(client);
registerColorRoleEvents(client);

require('./storesnipe')(client);
require('./starboardHandler')(client);
