const fs = require('fs');
const path = require('path');

const SLASH_DIR = path.join(__dirname, 'slashCommands');

function listFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFiles(full));
        else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_')) out.push(full);
    }
    return out;
}

function loadSlashCommands() {
    if (!fs.existsSync(SLASH_DIR)) return [];

    const loaded = [];
    for (const file of listFiles(SLASH_DIR)) {
        const command = require(file);
        if (!command?.data?.name || typeof command.execute !== 'function') {
            if (!command?.data) continue;
            throw new Error(`Slash command is missing data.name or execute(): ${file}`);
        }
        loaded.push(command);
    }

    const commands = loaded.filter(command => !command.grouped);
    const names = new Set();
    for (const command of commands) {
        if (names.has(command.data.name)) throw new Error(`Duplicate slash command name: /${command.data.name}`);
        names.add(command.data.name);
    }
    return commands;
}

module.exports = { loadSlashCommands, SLASH_DIR };
