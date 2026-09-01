const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BIRTHDAYS_PATH = path.join(DATA_DIR, 'birthdays.json');
const CONFIG_PATH = path.join(DATA_DIR, 'birthdayConfig.json');

let birthdayLoopStarted = false;

async function readJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

async function writeJson(filePath, data) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getOrdinalSuffix(number) {
    const lastTwoDigits = number % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return 'th';

    switch (number % 10) {
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

function getLocalDateParts(offsetMinutes) {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
    const localDate = new Date(utcMs + offsetMinutes * 60_000);

    return {
        year: localDate.getFullYear(),
        month: localDate.getMonth() + 1,
        day: localDate.getDate(),
        hour: localDate.getHours(),
        minute: localDate.getMinutes(),
    };
}

function isBirthdayToday(birthday, localDate) {
    return birthday.month === localDate.month && birthday.day === localDate.day;
}

function getAgeText(birthday, localDate) {
    if (!birthday.year) return null;

    const age = localDate.year - birthday.year;
    if (age < 1) return null;

    return `${age}${getOrdinalSuffix(age)}`;
}

async function handleBirthdayEntry(client, birthdays, key, birthday, config) {
    const guildConfig = config[birthday.guildId];
    if (!guildConfig?.roleId || !guildConfig?.channelId) return;

    const guild = client.guilds.cache.get(birthday.guildId);
    if (!guild) return;

    const localDate = getLocalDateParts(Number(birthday.timezoneOffsetMinutes ?? 0));
    const birthdayToday = isBirthdayToday(birthday, localDate);
    const celebratedKey = `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;

    const member = await guild.members.fetch(birthday.userId).catch(() => null);
    if (!member) return;

    const role = guild.roles.cache.get(guildConfig.roleId);
    if (!role) return;

    if (!birthdayToday) {
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role).catch(console.error);
        }

        return;
    }

    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(console.error);
    }

    if (birthday.lastCelebratedDate === celebratedKey) return;
    if (localDate.hour !== 0 || localDate.minute !== 0) return;

    const channel = guild.channels.cache.get(guildConfig.channelId);
    if (!channel) return;

    const ageText = getAgeText(birthday, localDate);

    if (ageText) {
        await channel.send(
            `Everyone wish <@${birthday.userId}> a happy **${ageText}** birthday today! 🥳`
        );
    } else {
        await channel.send(
            `Everyone wish <@${birthday.userId}> a happy birthday today! 🥳`
        );
    }

    birthdays[key].lastCelebratedDate = celebratedKey;
    birthdays[key].lastCelebratedAt = new Date().toISOString();

    await writeJson(BIRTHDAYS_PATH, birthdays);
}

async function checkBirthdays(client) {
    const birthdays = await readJson(BIRTHDAYS_PATH);
    const config = await readJson(CONFIG_PATH);

    for (const [key, birthday] of Object.entries(birthdays)) {
        await handleBirthdayEntry(client, birthdays, key, birthday, config).catch(console.error);
    }
}

function startBirthdayLoop(client) {
    if (birthdayLoopStarted) return;
    birthdayLoopStarted = true;

    setInterval(() => {
        checkBirthdays(client).catch(console.error);
    }, 60_000);

    checkBirthdays(client).catch(console.error);
}

module.exports = {
    startBirthdayLoop,
};