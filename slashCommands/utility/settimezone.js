const fs = require('fs/promises');
const path = require('path');
const {
    SlashCommandBuilder,
    InteractionContextType,
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TIMEZONES_PATH = path.join(DATA_DIR, 'userTimezones.json');

const TZ_REGEX = /^(?:GMT|UTC)?([+-])?(\d{1,2})(?::?([0-5]\d))?$/i;

async function ensureTimezoneFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(TIMEZONES_PATH);
    } catch {
        await fs.writeFile(TIMEZONES_PATH, JSON.stringify({}, null, 2), 'utf8');
    }
}

async function loadTimezones() {
    await ensureTimezoneFile();

    try {
        const raw = await fs.readFile(TIMEZONES_PATH, 'utf8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

async function saveTimezones(timezones) {
    await ensureTimezoneFile();
    await fs.writeFile(TIMEZONES_PATH, JSON.stringify(timezones, null, 2), 'utf8');
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Set your personal bot preferences')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .setIntegrationTypes(0, 1)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('timezone')
                .setDescription('Set your timezone')
                .addStringOption((option) =>
                    option
                        .setName('timezone')
                        .setDescription('Your GMT timezone, like GMT-5, GMT+1, -8, or +05:30')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const timezoneInput = interaction.options.getString('timezone', true).trim();
        const timezone = parseTimezone(timezoneInput);

        if (!timezone) {
            return interaction.reply({
                content:
                    'Invalid timezone. Use a GMT offset like `GMT-5`, `GMT+1`, `-8`, or `+05:30`.',
                ephemeral: true,
            });
        }

        const timezones = await loadTimezones();
        const userId = interaction.user.id;

        timezones[userId] = {
            userId,
            username: interaction.user.tag,
            timezone: timezone.display,
            timezoneOffsetMinutes: timezone.offsetMinutes,
            updatedAt: new Date().toISOString(),
        };

        await saveTimezones(timezones);

        return interaction.reply({
            content: `✅ Your timezone has been saved as **${timezone.display}**.`,
            ephemeral: true,
        });
    },
};