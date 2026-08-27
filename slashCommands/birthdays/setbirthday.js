const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    InteractionContextType,
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BIRTHDAYS_PATH = path.join(DATA_DIR, 'birthdays.json');

const DATE_REGEX = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
const TZ_REGEX = /^(?:GMT|UTC)?([+-])?(\d{1,2})(?::?([0-5]\d))?$/i;

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

function isValidDate(month, day, year = 2000) {
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function parseBirthdayDate(input) {
    const match = input.match(DATE_REGEX);
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : null;

    if (!month || !day) return null;
    if (month < 1 || month > 12) return null;

    const validationYear = year ?? 2000;
    if (!isValidDate(month, day, validationYear)) return null;

    return {
        month,
        day,
        year,
        hasYear: year !== null,
        display: year
            ? `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
            : `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
    };
}

function parseTimezone(input) {
    const match = input.match(TZ_REGEX);
    if (!match) return null;

    const sign = match[1] ?? '+';
    const hours = Number(match[2]);
    const minutes = match[3] ? Number(match[3]) : 0;

    if (hours > 14) return null;
    if (hours === 14 && minutes !== 0) return null;

    const offsetMinutes = (hours * 60 + minutes) * (sign === '-' ? -1 : 1);

    return {
        input,
        offsetMinutes,
        display: `GMT${sign}${String(hours).padStart(2, '0')}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`,
    };
}

function getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) return 'th';

    switch (day % 10) {
        case 1:
            return 'st';
        case 2:
            return 'nd';
        case 3:
            return 'rd';
        default:
            return 'th';
    }
}

function formatBirthdayLong(birthday) {
    const date = new Date(2000, birthday.month - 1, birthday.day);
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    const dayText = `${birthday.day}${getOrdinalSuffix(birthday.day)}`;

    return birthday.year ? `${monthName} ${dayText}, ${birthday.year}` : `${monthName} ${dayText}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setbirthday')
        .setDescription('Set your birthday for this server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addStringOption((opt) =>
            opt
                .setName('date')
                .setDescription('Your birthday, like 04/20 or 04/20/2004')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('timezone')
                .setDescription('Your GMT timezone, like GMT-5, GMT+1, -8, or +05:30')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        const dateInput = interaction.options.getString('date', true).trim();
        const timezoneInput = interaction.options.getString('timezone', true).trim();

        const birthday = parseBirthdayDate(dateInput);

        if (!birthday) {
            return interaction.reply({
                content: 'Invalid birthday format. Use `MM/DD/YYYY` or `MM/DD`.',
                ephemeral: true,
            });
        }

        const timezone = parseTimezone(timezoneInput);

        if (!timezone) {
            return interaction.reply({
                content:
                    'Invalid timezone. Use a GMT offset like `GMT-5`, `GMT+1`, `-8`, or `+05:30`.',
                ephemeral: true,
            });
        }

        const birthdays = await loadBirthdays();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const key = `${guildId}:${userId}`;

        birthdays[key] = {
            guildId,
            userId,
            username: interaction.user.tag,
            month: birthday.month,
            day: birthday.day,
            year: birthday.year,
            hasYear: birthday.hasYear,
            timezone: timezone.display,
            timezoneOffsetMinutes: timezone.offsetMinutes,
            updatedAt: new Date().toISOString(),
        };

        await saveBirthdays(birthdays);

        return interaction.reply({
            content: `✅ Birthday saved as **${formatBirthdayLong(birthday)}** with timezone **${timezone.display}**.`,
            ephemeral: true,
        });
    },
};