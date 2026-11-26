const { AsyncLocalStorage } = require('async_hooks');
const { createGuildStore } = require('./guildDataStore');

const DEFAULT_PREFIX = (process.env.PREFIX || ',').trim() || ',';
const MAX_LENGTH = 5;
const VALID_PREFIX = /^[^\s`*_~|<>@#:\\]{1,5}$/;

const store = createGuildStore('prefixes.json', () => ({ prefix: null }));
const cache = new Map();
const context = new AsyncLocalStorage();

async function initPrefixes() {
    for (const [guildId, data] of Object.entries(await store.all())) {
        if (data?.prefix) cache.set(guildId, data.prefix);
    }
}

function getPrefix(guildId) {
    return (guildId && cache.get(guildId)) || DEFAULT_PREFIX;
}

async function setPrefix(guildId, prefix) {
    const value = prefix && prefix !== DEFAULT_PREFIX ? prefix : null;
    await store.update(guildId, (data) => { data.prefix = value; });
    if (value) cache.set(guildId, value);
    else cache.delete(guildId);
    return getPrefix(guildId);
}

function runWithPrefix(prefix, fn) {
    return context.run({ prefix }, fn);
}

function currentPrefix() {
    return context.getStore()?.prefix ?? DEFAULT_PREFIX;
}

module.exports = {
    DEFAULT_PREFIX,
    MAX_LENGTH,
    VALID_PREFIX,
    initPrefixes,
    getPrefix,
    setPrefix,
    runWithPrefix,
    currentPrefix,
};
