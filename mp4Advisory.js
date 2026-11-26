function readBoxes(buf, start, end) {
    const boxes = [];
    let pos = start;
    while (pos + 8 <= end) {
        let size = buf.readUInt32BE(pos);
        const type = buf.toString('latin1', pos + 4, pos + 8);
        let header = 8;
        if (size === 1) {
            if (pos + 16 > end) break;
            size = Number(buf.readBigUInt64BE(pos + 8));
            header = 16;
        } else if (size === 0) {
            size = end - pos;
        }
        if (size < header || pos + size > end) break;
        boxes.push({ type, start: pos, size, header, end: pos + size });
        pos += size;
    }
    return boxes;
}

function findIlstPath(buf) {
    const top = readBoxes(buf, 0, buf.length);
    const moov = top.find(b => b.type === 'moov');
    const mdat = top.find(b => b.type === 'mdat');
    if (!moov) return { error: 'Not an MP4 file.' };

    const path = [moov];
    const udta = readBoxes(buf, moov.start + moov.header, moov.end).find(b => b.type === 'udta');
    if (!udta) return { moov, mdat, path };
    path.push(udta);

    const meta = readBoxes(buf, udta.start + udta.header, udta.end).find(b => b.type === 'meta');
    if (!meta) return { moov, mdat, path };
    path.push(meta);

    const ilst = readBoxes(buf, meta.start + meta.header + 4, meta.end).find(b => b.type === 'ilst');
    if (ilst) path.push(ilst);
    return { moov, mdat, path };
}

function readAdvisory(buf) {
    const { path } = findIlstPath(buf);
    const ilst = path?.find(b => b.type === 'ilst');
    if (!ilst) return null;

    const rtng = readBoxes(buf, ilst.start + ilst.header, ilst.end).find(b => b.type === 'rtng');
    if (!rtng) return null;
    const data = readBoxes(buf, rtng.start + rtng.header, rtng.end).find(b => b.type === 'data');
    if (!data || data.size < data.header + 9) return null;
    return buf.readUInt8(data.start + data.header + 8);
}

function rtngBox(value) {
    const box = Buffer.alloc(25);
    box.writeUInt32BE(25, 0);
    box.write('rtng', 4, 'latin1');
    box.writeUInt32BE(17, 8);
    box.write('data', 12, 'latin1');
    box.writeUInt32BE(0x15, 16);
    box.writeUInt32BE(0, 20);
    box.writeUInt8(value, 24);
    return box;
}

function handlerBox() {
    const payload = Buffer.alloc(25);
    payload.write('mdir', 8, 'latin1');
    payload.write('appl', 12, 'latin1');
    return wrap('hdlr', payload);
}

function wrap(type, payload, prefix = Buffer.alloc(0)) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + prefix.length + payload.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, prefix, payload]);
}

function writeAdvisory(buf, value) {
    const { moov, mdat, path, error } = findIlstPath(buf);
    if (error) throw new Error(error);
    if (mdat && moov.start < mdat.start) {
        throw new Error('Can\'t set the advisory on this M4A layout.');
    }
    if ([moov, ...path].some(b => b.header !== 8)) throw new Error('Unsupported MP4 file.');

    const ilst = path.find(b => b.type === 'ilst');
    let newIlstPayload;
    if (ilst) {
        const children = readBoxes(buf, ilst.start + 8, ilst.end).filter(b => b.type !== 'rtng');
        newIlstPayload = Buffer.concat([
            ...children.map(b => buf.subarray(b.start, b.end)),
            ...(value == null ? [] : [rtngBox(value)]),
        ]);
    } else {
        if (value == null) return buf;
        newIlstPayload = rtngBox(value);
    }

    let inner = wrap('ilst', newIlstPayload);
    for (const type of ['meta', 'udta', 'moov']) {
        const existing = path.find(b => b.type === type);
        if (!existing) {
            inner = type === 'meta' ? wrap('meta', Buffer.concat([handlerBox(), inner]), Buffer.alloc(4)) : wrap(type, inner);
            continue;
        }
        const childStart = existing.start + 8 + (type === 'meta' ? 4 : 0);
        const childType = { meta: 'ilst', udta: 'meta', moov: 'udta' }[type];
        const children = readBoxes(buf, childStart, existing.end);
        const parts = children.map(b => (b.type === childType ? inner : buf.subarray(b.start, b.end)));
        if (!children.some(b => b.type === childType)) parts.push(inner);
        const prefix = type === 'meta' ? buf.subarray(existing.start + 8, existing.start + 12) : Buffer.alloc(0);
        inner = wrap(type, Buffer.concat(parts), prefix);
    }

    return Buffer.concat([buf.subarray(0, moov.start), inner, buf.subarray(moov.end)]);
}

module.exports = { readAdvisory, writeAdvisory };
