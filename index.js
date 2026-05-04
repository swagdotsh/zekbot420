const fs = require('fs');
const path = require('path');
const {Client, GatewayIntentBits, Collection, Partials} = require('discord.js');

require('dotenv').config();

const {logMessageDeletion, logSnipeClear} = require('./log');
const {
    handleVoiceStateUpdate,
    handleVoiceMasterInteraction,
} = require('./commands/voicemaster/vmManager');
const {initDB} = require('./leveling');
const {initJailDB} = require('./jailHandler');
const {handleMessageXP} = require('./events/xpHandler');
const {handleVoiceXPStateUpdate, startVcXPLoop} = require('./events/vcXpHandler');
const {startJailExpiryLoop} = require('./events/jailExpiryLoop');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});


client.commands = new Collection();
client.slashCommands = new Collection();
client.snipes = new Map();
client.reactionSnipes = new Map();

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

const slashCommandsPath = path.join(__dirname, 'slashCommands');
if (fs.existsSync(slashCommandsPath)) {
    const walk = (dir) => {
        const entries = fs.readdirSync(dir, {withFileTypes: true});
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith('.js')) {
                const slashCommand = require(full);
                if (!slashCommand?.data?.name || typeof slashCommand.execute !== 'function') continue;
                client.slashCommands.set(slashCommand.data.name, slashCommand);
            }
        }
    };
    walk(slashCommandsPath);
}

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Eastern Conference Playoffs Round 2', {type: 3});
    await initDB();
    await initJailDB();
    startVcXPLoop(client);
    startJailExpiryLoop(client);
});

// Slash commands, buttons, and modals
client.on('interactionCreate', async (interaction) => {
    try {
        if (await handleVoiceMasterInteraction(interaction)) return;

        if (!interaction.isChatInputCommand()) return;

        const cmd = client.slashCommands.get(interaction.commandName);
        if (!cmd) return;

        await cmd.execute(interaction);
    } catch (error) {
        console.error(error);

        const payload = {
            content: 'There was an error executing that interaction.',
            ephemeral: true,
        };

        if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
        else await interaction.reply(payload);
    }
});

// Prefix commands
client.on('messageCreate', async (message) => {
    if (!message.author.bot && message.guild) {
        await handleMessageXP(message).catch(console.error);
    }

    if (message.author.bot || !message.content.startsWith(process.env.PREFIX)) return;

    const args = message.content.slice(process.env.PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.find(
        cmd => cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))
    );

    if (!command) return;

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(error);
        await message.reply('There was an error executing that command.');
    }
});

client.on('messageCreate', async message => {
    if (message.content === ',cs' || message.content === ',clearsnipe') {
        await logSnipeClear(client, message, message.author);
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

    client.reactionSnipes.set(reaction.message.channel.id, {
        emoji: reaction.emoji.toString(),
        user: user.tag,
        message: reaction.message.content || '[no text]',
        messageAuthor: reaction.message.author?.tag || 'Unknown',
        time: Date.now()
    });

    setTimeout(() => {
        client.reactionSnipes.delete(reaction.message.channel.id);
    }, 60000);
});

client.login(process.env.TOKEN);

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
        console.error('VoiceMaster voiceStateUpdate failed:', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    await handleVoiceXPStateUpdate(oldState, newState).catch(console.error);
});

require('./storesnipe')(client);