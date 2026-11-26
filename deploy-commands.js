const fs = require('fs');
const {REST, Routes} = require('discord.js');
const {loadSlashCommands, SLASH_DIR} = require('./slashLoader');

require('dotenv').config();

const missingDeployConfig = ['TOKEN', 'DISCORD_CLIENT_ID', 'NEON_DATABASE_URL']
    .filter((name) => !process.env[name]);

if (missingDeployConfig.length) {
    throw new Error(`Missing required environment variable(s): ${missingDeployConfig.join(', ')}`);
}

async function main() {
    if (!fs.existsSync(SLASH_DIR)) {
        console.error('Missing /slashCommands folder. Create it and add at least one slash command.');
        process.exit(1);
    }

    const commands = loadSlashCommands().map((cmd) => cmd.data.toJSON());

    const rest = new REST({version: '10'}).setToken(process.env.TOKEN);

    const args = process.argv.slice(2).map((a) => String(a).toLowerCase());
    const forceGlobal = args.includes('global') || args.includes('--global') || args.includes('-g');

    const useGuild = !!process.env.GUILD_ID && !forceGlobal;

    const route = useGuild
        ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID)
        : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

    console.log(
        `Deploying ${commands.length} slash command(s) to ${useGuild ? `guild ${process.env.GUILD_ID}` : 'global'}...`
    );

    await rest.put(route, {body: commands});

    if (!useGuild && process.env.GUILD_ID) {
        await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID), {body: []});
        console.log(`Removed the copies registered to guild ${process.env.GUILD_ID}, so commands don't show up twice there.`);
    } else if (useGuild) {
        console.log('If this bot also has global commands, they show up twice in this server. Run with --global to use global commands only.');
    }
    console.log('Done.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
