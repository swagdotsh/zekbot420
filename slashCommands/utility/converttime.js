const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    InteractionContextType,
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TIMEZONES_PATH = path.join(DATA_DIR, 'userTimezones.json');

const TIME_REGEX = /^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)\s+([A-Z]{2,5}|(?:GMT|UTC)?[+-]\d{1,2}(?::?[0-5]\d)?)$/i;
const GMT_REGEX = /^(?:GMT|UTC)?([+-])?(\d{1,2})(?::?([0-5]\d))?$/i;

const TIMEZONE_ABBREVIATIONS = {
    UTC: 0,
    GMT: 0,

    EST: -300,
    EDT: -240,
    CST: -360,
    CDT: -300,
    MST: -420,
    MDT: -360,
    PST: -480,
    PDT: -420,

    AKST: -540,
    AKDT: -480,
    HST: -600,

    BST: 60,
    CET: 60,
    CEST: 120,
    EET: 120,
    EEST: 180,

    MSK: 180,
    IST: 330,
    GST: 240,

    JST: 540,
    KST: 540,
    CSTCHINA: 480,
    AWST: 480,
    ACST: 570,
    AEST: 600,
    AEDT: 660,
    NZST: 720,
    NZDT: 780,
};

async function loadTimezones() {
    try {
        const raw = await fs.readFile(TIMEZONES_PATH, 'utf8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function parseGmtOffset(input) {
    const match = input.match(GMT_REGEX);
    if (!match) return null;

    const sign = match[1] ?? '+';
    const hours = Number(match[2]);
    const minutes = match[3] ? Number(match[3]) : 0;

    if (hours > 14) return null;
    if (hours === 14 && minutes !== 0) return null;

    return (hours * 60 + minutes) * (sign === '-' ? -1 : 1);
}

function parseTimezoneOffset(input) {
    const cleaned = input.trim().toUpperCase();

    if (TIMEZONE_ABBREVIATIONS[cleaned] !== undefined) {
        return TIMEZONE_ABBREVIATIONS[cleaned];
    }

    return parseGmtOffset(cleaned);
}

function formatOffset(offsetMinutes) {
    const sign = offsetMinutes < 0 ? '-' : '+';
    const absolute = Math.abs(offsetMinutes);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;

    return `GMT${sign}${String(hours).padStart(2, '0')}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

function parseTimeInput(input) {
    const match = input.trim().match(TIME_REGEX);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3].toUpperCase();
    const timezoneInput = match[4].toUpperCase();

    if (hours < 1 || hours > 12) return null;

    if (meridiem === 'AM' && hours === 12) {
        hours = 0;
    } else if (meridiem === 'PM' && hours !== 12) {
        hours += 12;
    }

    const offsetMinutes = parseTimezoneOffset(timezoneInput);
    if (offsetMinutes === null) return null;

    return {
        hours,
        minutes,
        sourceTimezone: timezoneInput,
        sourceOffsetMinutes: offsetMinutes,
    };
}

function convertTimeToOffset(time, targetOffsetMinutes) {
    const today = new Date();
    const utcMs = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        time.hours,
        time.minutes
    ) - time.sourceOffsetMinutes * 60_000;

    return new Date(utcMs + targetOffsetMinutes * 60_000);
}

function formatConvertedTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('convert')
        .setDescription('Convert things')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .setIntegrationTypes(0, 1)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('time')
                .setDescription('Convert a time to your saved timezone')
                .addStringOption((option) =>
                    option
                        .setName('time')
                        .setDescription('The time to convert, like 5PM EST, 7:30 PM PST, or 22:00 GMT+2')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const input = interaction.options.getString('time', true).trim();
        const parsedTime = parseTimeInput(input);

        if (!parsedTime) {
            return interaction.reply({
                content:
                    'Invalid time. Use a format like `5PM EST`, `7:30 PM PST`, `5PM GMT+2`, or `9:15 AM UTC-5`.',
            });
        }

        const timezones = await loadTimezones();
        const savedTimezone = timezones[interaction.user.id];

        if (!savedTimezone) {
            return interaction.reply({
                content: 'You do not have a timezone saved yet. Set one with `/set timezone` first.',
                ephemeral: true,
            });
        }

        const converted = convertTimeToOffset(parsedTime, savedTimezone.timezoneOffsetMinutes);
        const convertedTime = formatConvertedTime(converted);

        return interaction.reply({
            content:
                `**${input}** is **${convertedTime}** in your timezone ` +
                `(**${savedTimezone.timezone ?? formatOffset(savedTimezone.timezoneOffsetMinutes)}**).`,
        });
    },
};