const dns = require('dns/promises');
const net = require('net');

const blocked = new net.BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    blocked.addSubnet(address, prefix, 'ipv6');
}

function isBlockedAddress(address) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) return blocked.check(mapped, 'ipv4');
    return blocked.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

async function assertPublicUrl(rawUrl) {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) links are allowed.');

    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
        throw new Error('That link points to a private address.');
    }
    return url;
}

async function fetchLimited(rawUrl, { maxBytes, timeoutMs = 15000, maxRedirects = 5 } = {}) {
    const signal = AbortSignal.timeout(timeoutMs);
    let url = await assertPublicUrl(rawUrl);
    let response;

    for (let hop = 0; ; hop++) {
        response = await fetch(url, { redirect: 'manual', signal });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) break;
        if (hop >= maxRedirects) throw new Error('Too many redirects.');
        url = await assertPublicUrl(new URL(location, url).href);
    }

    if (!response.ok) throw new Error(`Failed to download file. HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('That file is too large to download.');

    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxBytes) {
            await response.body.cancel().catch(() => {});
            throw new Error('That file is too large to download.');
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

module.exports = { fetchLimited, assertPublicUrl, isBlockedAddress };
