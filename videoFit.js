const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const MIN_VIDEO_KBPS = 150;
const MAX_DURATION = 20 * 60;
const TIMEOUT_MS = 4 * 60 * 1000;

let queue = Promise.resolve();

function shortSideFor(videoKbps) {
    if (videoKbps >= 4000) return 1080;
    if (videoKbps >= 1800) return 720;
    if (videoKbps >= 900) return 540;
    if (videoKbps >= 450) return 480;
    if (videoKbps >= 250) return 360;
    return 270;
}

function plan(maxBytes, duration) {
    if (!duration || duration > MAX_DURATION) return null;
    const totalKbps = (maxBytes * 8 * 0.94) / duration / 1000;
    const audioKbps = totalKbps >= 600 ? 128 : totalKbps >= 300 ? 96 : 64;
    const videoKbps = Math.floor(totalKbps - audioKbps);
    if (videoKbps < MIN_VIDEO_KBPS) return null;
    return { videoKbps, audioKbps, shortSide: shortSideFor(videoKbps) };
}

function run(args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
        const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(signal ? 'ffmpeg timed out' : `ffmpeg exited ${code}: ${stderr.trim()}`));
        });
    });
}

async function encode(input, { videoKbps, audioKbps, shortSide }, maxBytes) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zekbot-fit-'));
    try {
        await fs.writeFile(path.join(dir, 'in'), input);
        const scale = `scale='if(gt(iw,ih),-2,min(${shortSide},iw))':'if(gt(iw,ih),min(${shortSide},ih),-2)'`;
        const video = ['-i', 'in', '-map', '0:v:0', '-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium',
            '-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.5)}k`, '-bufsize', `${videoKbps * 2}k`, '-passlogfile', 'pass'];
        await run([...video, '-pass', '1', '-an', '-f', 'mp4', os.devNull], dir);
        await run([...video, '-pass', '2', '-map', '0:a:0?', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-movflags', '+faststart', 'out.mp4'], dir);
        const output = await fs.readFile(path.join(dir, 'out.mp4'));
        return output.length <= maxBytes ? output : null;
    } finally {
        fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

function fitVideo(input, { maxBytes, duration }) {
    const settings = plan(maxBytes, duration);
    if (!settings) return Promise.resolve(null);
    const job = queue.then(async () => {
        const first = await encode(input, settings, maxBytes);
        if (first) return first;
        return encode(input, { ...settings, videoKbps: Math.floor(settings.videoKbps * 0.85) }, maxBytes);
    });
    queue = job.catch(() => {});
    return job;
}

module.exports = { fitVideo, plan };
