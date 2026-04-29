const fs = require('fs');
const path = require('path');
const {REST, Routes} = require('discord.js');

require('dotenv').config();

function readSlashCommandFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...readSlashCommandFiles(full));
        else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

async function main() {
    const slashDir = path.join(__dirname, 'slashCommands');
    if (!fs.existsSync(slashDir)) {
        console.error('Missing /slashCommands folder. Create it and add at least one slash command.');
        process.exit(1);
    }

    const files = readSlashCommandFiles(slashDir);

    const commands = files.map((file) => {
        const cmd = require(file);
        if (!cmd?.data?.toJSON) throw new Error("Slash command missing \"data\" (SlashCommandBuilder) in: "+file);
        return cmd.data.toJSON();
    });

    const rest = new REST({version: '10'}).setToken(process.env.TOKEN);

    if (!process.env.DISCORD_CLIENT_ID) throw new Error('Missing DISCORD_CLIENT_ID in .env');

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
    console.log('Done.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});