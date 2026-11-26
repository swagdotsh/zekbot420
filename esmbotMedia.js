const fs = require('fs');
const path = require('path');
const { fetchLimited } = require('./safeFetch');

process.env.VIPS_WARNING ??= '0';

const ESMBOT_DIR = path.join(__dirname, 'esmBot');
const NATIVE_PATH = path.join(ESMBOT_DIR, 'build', 'Release', 'esmbmedia.node');
const BASE_PATH = `${ESMBOT_DIR}${path.sep}`;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

const FONTS = ['futura', 'impact', 'helvetica', 'arial', 'roboto', 'noto', 'times', 'comic sans ms', 'ubuntu'];
const UNCANNY_PHASES = fs.existsSync(path.join(ESMBOT_DIR, 'assets/images/uncanny'))
    ? fs.readdirSync(path.join(ESMBOT_DIR, 'assets/images/uncanny')).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4))
    : [];
const CAPTION2_WORDS = ['me irl', 'dank', '2016', 'meme', 'wholesome', 'reddit', 'relatable', 'funny', 'template', 'hilarious', 'memes', 'deep fried'];
const REDDIT_NAMES = ['me_irl', 'dankmemes', 'hmmm', 'gaming', 'wholesome', 'chonkers', 'memes', 'funny', 'lies'];

const random = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const num = (value, fallback) => (Number.isFinite(value) ? value : fallback);

function textEncode(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('>', '&gt;')
        .replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;')
        .replaceAll('\\n', '\n')
        .replaceAll('\\:', ':')
        .replaceAll('\\,', ',');
}

const splitPair = (text) => String(text ?? '').split(/(?<!\\),/).map((part) => part.trim());
const font = (opts, fallback) => (opts.font && FONTS.includes(opts.font) ? opts.font : fallback);

const watermark = (file, extra) => ({ cmd: 'watermark', params: () => ({ water: `assets/images/${file}`, ...extra }) });

const EFFECTS = {
    '9gag': { desc: 'Adds a 9GAG watermark', ...watermark('9gag.png', { gravity: 6 }) },
    avs4you: { desc: 'Adds an AVS4You watermark', ...watermark('avs4you.png', { gravity: 5, resize: true }) },
    bandicam: { desc: 'Adds a Bandicam watermark', ...watermark('bandicam.png', { gravity: 2, resize: true }) },
    blur: { desc: 'Blurs an image', cmd: 'blur', params: () => ({ sharp: false }) },
    bounce: { desc: 'Makes an image bounce up and down', cmd: 'bounce', gif: true },
    caption: { desc: 'Adds a caption on top', cmd: 'caption', text: 'required', fonts: true, params: (o) => ({ caption: textEncode(o.text), font: font(o, 'futura') }) },
    caption2: {
        desc: 'Adds a bottom caption/tag list', cmd: 'captionTwo', text: 'optional', fonts: true,
        params: (o) => ({
            caption: o.text?.trim() ? textEncode(o.text) : [...CAPTION2_WORDS].sort(() => 0.5 - Math.random()).slice(0, 1 + Math.floor(Math.random() * 5)).join(' '),
            top: Boolean(o.flag),
            font: font(o, 'helvetica'),
        }),
        flag: 'put the caption on top',
    },
    circle: { desc: 'Applies a radial blur', cmd: 'circle' },
    crop: { desc: 'Crops an image to a square', cmd: 'crop' },
    deepfry: { desc: 'Deep-fries an image', cmd: 'deepfry' },
    deviantart: { desc: 'Adds a DeviantArt watermark', ...watermark('deviantart.png', { gravity: 5, resize: true }) },
    explode: { desc: 'Explodes an image', cmd: 'distort', params: () => ({ mapName: 'linearexplode.png' }) },
    fade: { desc: 'Fades an image in', cmd: 'fade', gif: true, params: (o) => ({ alpha: Boolean(o.flag) }), flag: 'fade in from transparency' },
    flip: { desc: 'Flips an image upside down', cmd: 'flip' },
    flop: { desc: 'Mirrors an image left to right', cmd: 'flip', params: () => ({ flop: true }) },
    freeze: { desc: 'Makes a GIF only play once', cmd: 'freeze', gif: true, amount: 'frame to stop on', params: (o) => ({ loop: false, frame: Number.isFinite(o.amount) ? Math.max(0, Math.round(o.amount)) : -1 }) },
    funky: { desc: 'Adds a "funky" watermark', ...watermark('funky.png', { gravity: 3, resize: true }) },
    gamexplain: { desc: 'Makes a GameXplain thumbnail', cmd: 'gamexplain' },
    gif: { desc: 'Converts an image to a GIF', cmd: 'togif', gif: true },
    globe: { desc: 'Spins an image on a globe', cmd: 'globe', gif: true, params: (o) => ({ snow: Boolean(o.flag) }), flag: 'make it a snow globe' },
    grayscale: { desc: 'Grayscale filter', cmd: 'colors', params: () => ({ color: 'grayscale' }) },
    haah: { desc: 'Mirrors the left side onto the right', cmd: 'mirror', params: () => ({ first: true }) },
    homebrew: { desc: 'Homebrew Channel style logo from text', cmd: 'homebrew', noInput: true, text: 'required', params: (o) => ({ caption: textEncode(o.text) }) },
    hooh: { desc: 'Mirrors the bottom onto the top', cmd: 'mirror', params: () => ({ vertical: true }) },
    hue: { desc: 'Shifts the hue', cmd: 'colors', amount: 'degrees to shift, -180 to 180 (default 90)', params: (o) => ({ color: 'hueshift', shift: clamp(Math.round(num(o.amount, 90)), -180, 180) }) },
    hypercam: { desc: 'Adds an Unregistered HyperCam 2 watermark', ...watermark('hypercam.png', { gravity: 1, resize: true }) },
    ifunny: { desc: 'Adds an iFunny watermark', ...watermark('ifunny.png', { gravity: 8, resize: true, append: true }) },
    implode: { desc: 'Implodes an image', cmd: 'distort', params: () => ({ mapName: 'linearimplode.png' }) },
    invert: { desc: 'Inverts the colors', cmd: 'invert' },
    jpeg: { desc: 'Adds JPEG compression', cmd: 'jpeg', amount: 'quality, 1 to 100 (default 1)', params: (o) => ({ quality: clamp(Math.round(num(o.amount, 1)), 1, 100) }) },
    jumble: { desc: 'Shuffles the frames of a GIF', cmd: 'jumble', gif: true, amount: 'frames to group, 1 to 30 (default 1)', params: (o) => ({ groupsize: clamp(Math.round(num(o.amount, 1)), 1, 30) }) },
    kinemaster: { desc: 'Adds a KineMaster watermark', ...watermark('kinemaster.png', { gravity: 3, resize: true }) },
    magik: { desc: 'Content-aware scale (liquid rescale)', cmd: 'magik' },
    meme: {
        desc: 'Classic top/bottom meme text', cmd: 'meme', text: 'required', fonts: true, textHint: 'top text, bottom text',
        params: (o) => {
            const [top, bottom] = splitPair(o.text);
            const caps = (t) => (o.flag ? t : t.toUpperCase());
            return { topText: textEncode(caps(top ?? '')), bottomText: bottom ? textEncode(caps(bottom)) : '', font: font(o, 'impact') };
        },
        flag: 'keep the text case as typed',
    },
    memecenter: { desc: 'Adds a MemeCenter watermark', ...watermark('memecenter.png', { gravity: 9, mc: true }) },
    motivate: {
        desc: 'Motivational poster', cmd: 'motivate', text: 'required', fonts: true, textHint: 'title, subtitle',
        params: (o) => {
            const [top, bottom] = splitPair(o.text);
            return { topText: textEncode(top ?? ''), bottomText: bottom ? textEncode(bottom) : '', font: font(o, 'times') };
        },
    },
    pixelate: { desc: 'Pixelates an image', cmd: 'resize' },
    powerdirector: { desc: 'Adds a PowerDirector watermark', ...watermark('powerdirector.png', { gravity: 9, resize: true }) },
    reddit: { desc: 'Adds a Reddit watermark', cmd: 'reddit', text: 'optional', params: (o) => ({ caption: o.text?.trim() ? textEncode(o.text).replaceAll('\n', '').replaceAll(' ', '') : random(REDDIT_NAMES) }) },
    reverse: { desc: 'Plays a GIF backwards', cmd: 'reverse', gif: true },
    rotate: { desc: 'Rotates an image', cmd: 'spin', amount: 'angle in degrees (default 90)', params: (o) => ({ angle: clamp(num(o.amount, 90), 1, 360) }) },
    scott: { desc: 'Scott the Woz shows off your image', cmd: 'scott' },
    sepia: { desc: 'Sepia filter', cmd: 'colors', params: () => ({ color: 'sepia' }) },
    sharpen: { desc: 'Sharpens an image', cmd: 'blur', params: () => ({ sharp: true }) },
    shutterstock: { desc: 'Adds a Shutterstock watermark', ...watermark('shutterstock.png', { gravity: 5, resize: true }) },
    slide: { desc: 'Slides an image across', cmd: 'slide', gif: true, params: (o) => ({ vertical: Boolean(o.flag), reverse: false }), flag: 'slide vertically' },
    slow: { desc: 'Slows a GIF down', cmd: 'speed', gif: true, amount: 'how many times slower (default 2)', params: (o) => ({ slow: true, speed: Math.max(1, num(o.amount, 2)) }) },
    snapchat: { desc: 'Snapchat style caption', cmd: 'snapchat', text: 'required', amount: 'caption height, 0 (top) to 1 (bottom)', params: (o) => ({ caption: textEncode(o.text), pos: clamp(num(o.amount, 0.565), 0, 1) }) },
    snowglobe: { desc: 'Puts an image in a snow globe', cmd: 'globe', gif: true, params: () => ({ snow: true }) },
    sonic: { desc: 'Sonic says... (from text)', cmd: 'sonic', noInput: true, text: 'required', params: (o) => ({ text: textEncode(o.text) }) },
    soos: { desc: 'Loops a GIF forwards then backwards', cmd: 'reverse', gif: true, params: () => ({ soos: true }) },
    speechbubble: {
        desc: 'Adds a speech bubble', cmd: 'watermark', amount: 'bubble size, 0.01 to 1 (default 0.2)', flag: 'put it on the bottom',
        params: (o) => ({ water: 'assets/images/speechbubble.png', gravity: o.flag ? 8 : 2, resize: true, yscale: clamp(num(o.amount, 0.2), 0.01, 1), alpha: false, flipX: false, flipY: Boolean(o.flag) }),
    },
    speed: { desc: 'Speeds a GIF up', cmd: 'speed', gif: true, amount: 'how many times faster (default 2)', params: (o) => ({ speed: Math.max(1, num(o.amount, 2)) }) },
    spin: { desc: 'Makes an image spin', cmd: 'spin', gif: true },
    spotify: { desc: 'Spotify "This Is" cover', cmd: 'spotify', text: 'required', params: (o) => ({ caption: textEncode(o.text) }) },
    squish: { desc: 'Squishes and stretches an image', cmd: 'squish', gif: true },
    stretch: { desc: 'Stretches an image to a square', cmd: 'resize', params: () => ({ stretch: true }) },
    swirl: { desc: 'Swirls an image', cmd: 'swirl' },
    tile: { desc: 'Tiles an image', cmd: 'tile' },
    uncanny: {
        desc: 'Mr. Incredible becoming uncanny', cmd: 'uncanny', text: 'required', fonts: true, textHint: 'left text, right text',
        params: (o) => {
            const [left, right] = splitPair(o.text);
            return {
                caption: textEncode(left ?? ''),
                caption2: textEncode(right ?? ''),
                path: `assets/images/uncanny/${random(UNCANNY_PHASES.filter((p) => p !== 'goated'))}.png`,
                font: font(o, 'helvetica'),
            };
        },
    },
    uncaption: { desc: 'Removes a caption from the top', cmd: 'uncaption', amount: 'how close to white counts as caption, 0 to 1 (default 0.95)', params: (o) => ({ tolerance: clamp(num(o.amount, 0.95), 0, 1) }) },
    unfreeze: { desc: 'Makes a GIF loop forever', cmd: 'freeze', gif: true, params: () => ({ loop: true }) },
    vignette: { desc: 'Adds a vignette', ...watermark('vignette.png', { yscale: 1.0, gravity: 1, resize: true }) },
    waaw: { desc: 'Mirrors the right side onto the left', cmd: 'mirror' },
    wall: { desc: 'Makes a wall out of an image', cmd: 'wall' },
    whisper: { desc: 'Whisper style caption', cmd: 'whisper', text: 'required', params: (o) => ({ caption: textEncode(o.text) }) },
    wide: { desc: 'Makes an image really wide', cmd: 'resize', amount: 'how wide, 1 to 19 (default 19)', params: (o) => ({ wide: true, amount: clamp(Math.round(num(o.amount, 19)), 1, 19) }) },
    woow: { desc: 'Mirrors the top onto the bottom', cmd: 'mirror', params: () => ({ vertical: true, first: true }) },
};

let native = null;
let loadError = null;

function load() {
    if (native || loadError) return native;
    try {
        native = require(NATIVE_PATH);
        native.init?.();
    } catch (error) {
        loadError = error;
        native = null;
        if (fs.existsSync(NATIVE_PATH)) console.error('[esmbot] failed to load the image natives:', error.message);
    }
    return native;
}

function isAvailable() {
    return Boolean(load());
}

function availableEffects() {
    const lib = load();
    if (!lib) return [];
    const names = new Set((lib.funcs?.image ?? []).map((f) => f.name));
    return Object.keys(EFFECTS).filter((key) => names.has(EFFECTS[key].cmd));
}

const MIME_TO_EXT = { 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/heif': 'avif' };

function sniffType(buffer) {
    if (buffer.length < 12) return null;
    if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
    if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG') return 'png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    if (buffer.subarray(4, 12).toString('ascii').match(/^ftyp(avif|avis|heic|mif1)/)) return 'avif';
    return null;
}

async function download(url) {
    const buffer = await fetchLimited(url, { maxBytes: MAX_INPUT_BYTES, timeoutMs: 20000 });
    const type = sniffType(buffer);
    if (!type) throw Object.assign(new Error('That file isn\'t an image I can edit (PNG, JPEG, GIF, WebP or AVIF).'), { userFacing: true });
    return { buffer, type };
}

async function applyEffect(effectName, options, input) {
    const lib = load();
    if (!lib) throw Object.assign(new Error('Image editing isn\'t set up on this bot yet.'), { userFacing: true });
    const effect = EFFECTS[effectName];
    if (!effect) throw Object.assign(new Error('That effect doesn\'t exist.'), { userFacing: true });

    const params = { ...(effect.params?.(options) ?? {}), basePath: BASE_PATH };
    if (options.togif && !effect.gif) params.togif = true;

    let inputObj = {};
    if (!effect.noInput) {
        const { buffer, type } = input.buffer
            ? { buffer: input.buffer, type: sniffType(input.buffer) }
            : await download(input.url);
        if (!type) throw Object.assign(new Error('That file isn\'t an image I can edit (PNG, JPEG, GIF, WebP or AVIF).'), { userFacing: true });
        inputObj = {
            data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            type,
        };
    }

    const { data, type } = await lib.process('image', effect.cmd, params, inputObj);
    return { buffer: Buffer.from(data), ext: MIME_TO_EXT[type] ?? type ?? 'png' };
}

module.exports = { EFFECTS, FONTS, isAvailable, availableEffects, applyEffect, NATIVE_PATH };
