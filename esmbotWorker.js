process.env.VIPS_WARNING ??= '0';

const path = require('path');

const NATIVE_PATH = path.join(__dirname, 'esmBot', 'build', 'Release', 'esmbmedia.node');

let native;
try {
    native = require(NATIVE_PATH);
    native.init?.();
} catch (error) {
    process.send({ type: 'failed', message: error.message });
    process.exit(1);
}

process.send({ type: 'ready', funcs: (native.funcs?.image ?? []).map((f) => f.name) });

process.on('message', async ({ id, cmd, params, input }) => {
    try {
        const { data, type } = await native.process('image', cmd, params, input ?? {});
        process.send({ id, ok: true, data: Buffer.from(data), type });
    } catch (error) {
        process.send({ id, ok: false, message: String(error?.message ?? error) });
    }
});

process.on('disconnect', () => process.exit(0));
