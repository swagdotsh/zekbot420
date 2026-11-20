const { sql } = require('./db');
const { createDueScheduler, notifyDue } = require('./dueScheduler');

const BATCH_SIZE = 50;
const MAX_ACTIVE_PER_USER = 25;
const MAX_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const MAX_REASON_LENGTH = 1000;

const UNIT_MS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
};

async function initRemindersDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS reminders (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            guild_id TEXT,
            channel_id TEXT,
            kind TEXT NOT NULL DEFAULT 'reminder',
            reason TEXT NOT NULL,
            due_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS reminders_due_at_idx ON reminders (due_at)`;
}

function parseDuration(input) {
    const text = String(input ?? '').trim().toLowerCase();
    if (/^\d+$/.test(text)) return Number(text) * UNIT_MS.m;
    if (!/^(\d+[smhdw])+$/.test(text)) return null;

    let total = 0;
    for (const [, amount, unit] of text.matchAll(/(\d+)([smhdw])/g)) total += Number(amount) * UNIT_MS[unit];
    return total;
}

function parseDate(input) {
    const match = String(input ?? '').trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!match) return null;

    const [month, day, year] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day);
    const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return valid ? date.getTime() : null;
}

function parseWhen(input, now = Date.now()) {
    const duration = parseDuration(input);
    const dueAt = duration !== null ? now + duration : parseDate(input);

    if (dueAt === null) return { error: 'Use a duration like `10m`, `2h30m`, `3d`, `1w`, or a date like `MM-DD-YYYY`.' };
    if (dueAt <= now) return { error: duration !== null ? 'Time must be greater than 0.' : 'That date is in the past.' };
    if (dueAt - now > MAX_AHEAD_MS) return { error: 'That is too far in the future (max 5 years).' };
    return { dueAt };
}

async function createReminder({ userId, guildId = null, channelId = null, kind = 'reminder', reason, dueAt }) {
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM reminders WHERE user_id = ${userId}`;
    if (count >= MAX_ACTIVE_PER_USER) {
        return { error: `You already have ${MAX_ACTIVE_PER_USER} reminders/timers pending. Let some finish first.` };
    }

    const text = String(reason || 'No reason provided').slice(0, MAX_REASON_LENGTH);
    await sql`
        INSERT INTO reminders (user_id, guild_id, channel_id, kind, reason, due_at, created_at)
        VALUES (${userId}, ${guildId}, ${channelId}, ${kind}, ${text}, ${dueAt}, ${Date.now()})
    `;
    notifyDue('reminders', dueAt);
    return { dueAt };
}

function formatDue(dueAt) {
    const unix = Math.floor(dueAt / 1000);
    return `<t:${unix}:F> (<t:${unix}:R>)`;
}

async function deliver(client, reminder) {
    const label = reminder.kind === 'timer' ? '⏰ Timer finished' : '⏰ Reminder';
    const content = `${label}: ${reminder.reason}`;

    const user = await client.users.fetch(reminder.user_id).catch(() => null);
    if (user && await user.send({ content, allowedMentions: { parse: [] } }).then(() => true).catch(() => false)) return;

    const channel = reminder.channel_id ? await client.channels.fetch(reminder.channel_id).catch(() => null) : null;
    if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send({
            content: `<@${reminder.user_id}> ${content}\n-# I couldn't DM you, so I'm posting it here.`,
            allowedMentions: { users: [reminder.user_id] },
        }).catch(() => {});
    }
}

async function deliverDueReminders(client) {
    for (;;) {
        const due = await sql`
            DELETE FROM reminders
            WHERE id IN (SELECT id FROM reminders WHERE due_at <= ${Date.now()} ORDER BY due_at LIMIT ${BATCH_SIZE})
            RETURNING *
        `;

        for (const reminder of due) {
            await deliver(client, reminder).catch((error) => console.error('Failed to deliver reminder:', error));
        }

        if (due.length < BATCH_SIZE) return;
    }
}

async function getNextReminderDue() {
    const [row] = await sql`SELECT MIN(due_at) AS next FROM reminders WHERE due_at > ${Date.now()}`;
    return row?.next == null ? null : Number(row.next);
}

function startReminderLoop(client) {
    createDueScheduler('reminders', {
        runDue: () => deliverDueReminders(client),
        getNextDue: getNextReminderDue,
    }).start();
}

module.exports = { initRemindersDB, parseWhen, createReminder, formatDue, startReminderLoop };
