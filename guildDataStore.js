const path = require('path');
const { readJson, updateJson } = require('./jsonStore');
const { DATA_DIR } = require('./paths');

function createGuildStore(fileName, defaults = () => ({})) {
    const file = path.join(DATA_DIR, fileName);
    let cache = null;
    let loading = null;

    const withDefaults = (value) => ({ ...defaults(), ...(value ?? {}) });

    async function load() {
        if (cache) return cache;
        loading ??= readJson(file, {}).then((data) => {
            cache = data && typeof data === 'object' ? data : {};
            return cache;
        }).finally(() => { loading = null; });
        return loading;
    }

    async function get(guildId) {
        const data = await load();
        return withDefaults(data[guildId]);
    }

    async function update(guildId, mutate) {
        await load();
        let result;
        const next = await updateJson(file, {}, async (all) => {
            const current = withDefaults(all[guildId]);
            result = (await mutate(current)) ?? current;
            all[guildId] = result;
            return all;
        });
        cache = next;
        return withDefaults(result);
    }

    async function all() {
        return { ...(await load()) };
    }

    return { get, update, all, file };
}

module.exports = { createGuildStore };
