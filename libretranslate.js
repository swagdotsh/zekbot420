const axios = require('axios');

const API_KEY = process.env.LIBRETRANSLATE_KEY;
const CUSTOM_URL = process.env.LIBRETRANSLATE_URL?.replace(/\/+$/, '');
const TIMEOUT = 8000;

const PUBLIC_INSTANCES = [
    'https://translate.tedomum.net',
    'https://translate.adminforge.de',
    'https://translate.envs.net',
    'https://translate.direitosdigitais.pt',
    'https://traduzioni.serviziliberi.it',
    'https://translate.libregalaxy.org',
    'https://libretranslate.bolha.tools'
];

const INSTANCES = CUSTOM_URL
    ? [CUSTOM_URL, ...PUBLIC_INSTANCES.filter((url) => url !== CUSTOM_URL)]
    : PUBLIC_INSTANCES;

let preferred = 0;

function isInputError(err) {
    return err.response?.status === 400;
}

async function request(path, body) {
    const start = preferred;
    let lastError;

    for (let i = 0; i < INSTANCES.length; i++) {
        const index = (start + i) % INSTANCES.length;
        const url = INSTANCES[index];
        const payload = url === CUSTOM_URL && API_KEY ? { ...body, api_key: API_KEY } : body;

        try {
            const res = await axios.post(`${url}${path}`, payload, { timeout: TIMEOUT });
            preferred = index;
            return res.data;
        } catch (err) {
            if (isInputError(err)) throw err;
            lastError = err;
            console.warn(`LibreTranslate ${url} failed: ${err.response?.status || err.code || err.message}`);
        }
    }

    throw lastError;
}

async function detectLanguage(text) {
    const data = await request('/detect', { q: text });
    return (Array.isArray(data) && data[0]?.language) || 'auto';
}

async function translateText(text, source, target) {
    const data = await request('/translate', { q: text, source, target, format: 'text' });
    if (typeof data?.translatedText !== 'string') throw new Error('Invalid translation response');
    return data.translatedText;
}

module.exports = { detectLanguage, translateText };
