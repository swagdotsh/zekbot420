const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BIRTHDAYS_PATH = path.join(DATA_DIR, 'birthdays.json');

async function ensureBirthdayFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(BIRTHDAYS_PATH);
    } catch {
        await fs.writeFile(BIRTHDAYS_PATH, JSON.stringify({}, null, 2), 'utf8');
    }
}

async function loadBirthdays() {
    await ensureBirthdayFile();

    try {
        const raw = await fs.readFile(BIRTHDAYS_PATH, 'utf8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

async function saveBirthdays(birthdays) {
    await ensureBirthdayFile();
    await fs.writeFile(BIRTHDAYS_PATH, JSON.stringify(birthdays, null, 2), 'utf8');
}

module.exports = {
    name: 'removebirthday',
    aliases: ['removebday', 'deletebirthday', 'deletebday'],

    async execute(message) {
        if (!message.guild) return;

        const birthdays = await loadBirthdays();

        const guildId = message.guild.id;
        const userId = message.author.id;
        const key = `${guildId}:${userId}`;

        if (!birthdays[key]) {
            return message.reply(
                'You do not have a birthday saved in this server.'
            );
        }

        delete birthdays[key];

        await saveBirthdays(birthdays);

        return message.reply(
            '✅ Your birthday has been removed from this server.'
        );
    },
};