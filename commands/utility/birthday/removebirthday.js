const fs = require('fs/promises');
const path = require('path');
const { writeJsonAtomic } = require('../../../jsonStore');
const { DATA_DIR: PROJECT_DATA_DIR } = require('../../../paths');

const DATA_DIR = PROJECT_DATA_DIR;
const BIRTHDAYS_PATH = path.join(DATA_DIR, 'birthdays.json');

async function ensureBirthdayFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(BIRTHDAYS_PATH);
    } catch {
        await writeJsonAtomic(BIRTHDAYS_PATH, {});
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
    await writeJsonAtomic(BIRTHDAYS_PATH, birthdays);
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