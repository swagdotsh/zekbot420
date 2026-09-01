const fs = require('fs/promises');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder,
    InteractionContextType,
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BIRTHDAYS_PATH = path.join(DATA_DIR, 'birthdays.json');

const PAGE_SIZE = 10;

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

function formatBirthdayDate(birthday) {
    const date = new Date(2000, birthday.month - 1, birthday.day);
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    const dayText = `${birthday.day}${getOrdinalSuffix(birthday.day)}`;

    return `${monthName} ${dayText}`;
}

function formatBirthdayDateWithYear(birthday) {
    const formattedDate = formatBirthdayDate(birthday);

    return birthday.year ? `${formattedDate}, ${birthday.year}` : formattedDate;
}

function getNextBirthdayDate(birthday, now) {
    const thisYearBirthday = new Date(
        now.getFullYear(),
        birthday.month - 1,
        birthday.day,
        0,
        0,
        0,
        0
    );

    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
    );

    if (thisYearBirthday >= today) {
        return thisYearBirthday;
    }

    return new Date(
        now.getFullYear() + 1,
        birthday.month - 1,
        birthday.day,
        0,
        0,
        0,
        0
    );
}

function getDaysUntil(date, now) {
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
    );

    const target = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0,
        0,
        0,
        0
    );

    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function buildBirthdayPages(serverBirthdays, guild) {
    const now = new Date();

    const upcomingBirthdays = serverBirthdays
        .map((birthday) => {
            const nextDate = getNextBirthdayDate(birthday, now);
            const daysUntil = getDaysUntil(nextDate, now);

            return {
                ...birthday,
                nextDate,
                daysUntil,
            };
        })
        .filter((birthday) => birthday.daysUntil >= 0 && birthday.daysUntil <= 365)
        .sort((a, b) => {
            const dateDiff = a.nextDate.getTime() - b.nextDate.getTime();
            if (dateDiff !== 0) return dateDiff;

            return String(a.userId).localeCompare(String(b.userId));
        });

    const pages = [];

    for (let i = 0; i < upcomingBirthdays.length; i += PAGE_SIZE) {
        pages.push(upcomingBirthdays.slice(i, i + PAGE_SIZE));
    }

    if (!pages.length) pages.push([]);

    return pages.map((pageBirthdays, index) => {
        const description = pageBirthdays.length
            ? pageBirthdays
                .map((birthday, birthdayIndex) => {
                    const position = index * PAGE_SIZE + birthdayIndex + 1;
                    const daysText = birthday.daysUntil === 0
                        ? 'today'
                        : `in ${birthday.daysUntil} day${birthday.daysUntil === 1 ? '' : 's'}`;

                    return `**${position}.** <@${birthday.userId}> — **${formatBirthdayDate(birthday)}** (${daysText})`;
                })
                .join('\n')
            : 'No birthdays have been set in this server yet.';

        return new EmbedBuilder()
            .setColor('#ff9ad5')
            .setTitle(`Upcoming Birthdays in ${guild.name}`)
            .setDescription(description)
            .setFooter({
                text: `Page ${index + 1} of ${pages.length}`,
            })
            .setTimestamp();
    });
}

function buildButtons(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('birthdays_prev')
            .setEmoji('⬅')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId('birthdays_next')
            .setEmoji('➡')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthdays')
        .setDescription('View server birthdays or a specific user birthday')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('User to check birthday for')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        const birthdays = await loadBirthdays();
        const targetUser = interaction.options.getUser('user');

        if (targetUser) {
            const key = `${interaction.guild.id}:${targetUser.id}`;
            const birthday = birthdays[key];

            if (!birthday) {
                return interaction.reply({
                    content: `${targetUser} does not have a birthday set up in this server.`,
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content: `${targetUser}'s birthday is on **${formatBirthdayDateWithYear(birthday)}**.`,
            });
        }

        const serverBirthdays = Object.values(birthdays).filter(
            (birthday) => birthday.guildId === interaction.guild.id
        );

        const pages = buildBirthdayPages(serverBirthdays, interaction.guild);
        let currentPage = 0;

        const reply = await interaction.reply({
            embeds: [pages[currentPage]],
            components: pages.length > 1 ? [buildButtons(currentPage, pages.length)] : [],
            fetchReply: true,
        });

        if (pages.length <= 1) return;

        const collector = reply.createMessageComponentCollector({
            time: 120_000,
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.user.id !== interaction.user.id) {
                return buttonInteraction.reply({
                    content: 'Only the person who ran this command can use these buttons.',
                    ephemeral: true,
                });
            }

            if (buttonInteraction.customId === 'birthdays_prev') {
                currentPage = Math.max(currentPage - 1, 0);
            }

            if (buttonInteraction.customId === 'birthdays_next') {
                currentPage = Math.min(currentPage + 1, pages.length - 1);
            }

            return buttonInteraction.update({
                embeds: [pages[currentPage]],
                components: [buildButtons(currentPage, pages.length)],
            });
        });

        collector.on('end', async () => {
            await reply.edit({
                components: [],
            }).catch(() => null);
        });
    },
};