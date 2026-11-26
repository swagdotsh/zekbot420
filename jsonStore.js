const fs = require('fs');
const path = require('path');

const queues = new Map();

function withFileLock(file, fn) {
    const key = path.resolve(file);
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    queues.set(key, tail);
    tail.then(() => {
        if (queues.get(key) === tail) queues.delete(key);
    });
    return run;
}

async function writeJsonUnlocked(file, data) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(temp, file);
}

function writeJsonAtomic(file, data) {
    return withFileLock(file, () => writeJsonUnlocked(file, data));
}

async function readJson(file, fallback) {
    let raw;
    try {
        raw = await fs.promises.readFile(file, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        throw error;
    }
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
}

function updateJson(file, fallback, mutate) {
    return withFileLock(file, async () => {
        const current = await readJson(file, fallback);
        const next = (await mutate(current)) ?? current;
        await writeJsonUnlocked(file, next);
        return next;
    });
}

module.exports = { withFileLock, readJson, writeJsonAtomic, updateJson };
