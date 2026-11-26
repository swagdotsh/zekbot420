const MAX_TIMER_MS = 2 ** 31 - 1;
const RESYNC_MS = 6 * 60 * 60 * 1000;
const MIN_DELAY_MS = 1000;
const RETRY_MS = 60 * 1000;
const FAILED_ITEM_RETRY_MS = 30 * 60 * 1000;

const schedulers = new Map();

function createDueScheduler(name, { runDue, getNextDue }) {
    let timer = null;
    let scheduledAt = null;
    let running = false;
    let notifiedWhileRunning = null;

    function schedule(at) {
        if (timer) clearTimeout(timer);
        const target = at ?? Date.now() + RESYNC_MS;
        const delay = Math.min(Math.max(target - Date.now(), MIN_DELAY_MS), RESYNC_MS, MAX_TIMER_MS);
        scheduledAt = Date.now() + delay;
        timer = setTimeout(run, delay);
    }

    async function run() {
        if (running) return;
        running = true;
        notifiedWhileRunning = null;

        try {
            const hadFailures = await runDue();
            let next = await getNextDue();
            if (hadFailures) next = Math.min(next ?? Infinity, Date.now() + FAILED_ITEM_RETRY_MS);
            if (notifiedWhileRunning !== null) next = next === null ? notifiedWhileRunning : Math.min(next, notifiedWhileRunning);
            schedule(next);
        } catch (error) {
            console.error(`[${name}] due check failed, retrying in a minute:`, error);
            schedule(Date.now() + RETRY_MS);
        } finally {
            running = false;
        }
    }

    function notify(dueAt) {
        const at = dueAt instanceof Date ? dueAt.getTime() : Number(dueAt);
        if (!Number.isFinite(at)) return;

        if (running) {
            notifiedWhileRunning = notifiedWhileRunning === null ? at : Math.min(notifiedWhileRunning, at);
            return;
        }
        if (scheduledAt === null || at < scheduledAt) schedule(at);
    }

    const scheduler = { start: run, notify };
    schedulers.set(name, scheduler);
    return scheduler;
}

function notifyDue(name, dueAt) {
    schedulers.get(name)?.notify(dueAt);
}

module.exports = { createDueScheduler, notifyDue };
