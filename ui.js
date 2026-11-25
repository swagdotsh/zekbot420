const EMOJI = {
    smirk: '<:smirk2:1498272372539785286>',
    loading: '<a:spinbot420:1498959085427490937>',
    ok: '✅',
};

const ok = (text) => `${EMOJI.ok} ${text}`;
const fail = (text) => `${text} ${EMOJI.smirk}`;
const loading = (text) => `${EMOJI.loading} ${text}`;

module.exports = { EMOJI, ok, fail, loading };
