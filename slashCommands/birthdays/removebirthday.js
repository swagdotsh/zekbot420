const fs = require('fs/promises');
const path = require('path');
const { writeJsonAtomic } = require('../../jsonStore');
const { DATA_DIR: PROJECT_DATA_DIR } = require('../../paths');
const {
    SlashCommandBuilder,
    InteractionContextType,
    MessageFlags
} = require('discord.js');

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
    data: new SlashCommandBuilder()
        .setName('removebirthday')
        .setDescription('Remove your birthday from this server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0),

    async execute(interaction) {
        if (!interaction.guild) return;

        const birthdays = await loadBirthdays();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const key = `${guildId}:${userId}`;

        if (!birthdays[key]) {
            return interaction.reply({
                content: 'You do not have a birthday saved in this server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        delete birthdays[key];

        await saveBirthdays(birthdays);

        return interaction.reply({
            content: '✅ Your birthday has been removed from this server.',
            flags: MessageFlags.Ephemeral,
        });
    },
};