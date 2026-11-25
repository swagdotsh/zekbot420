const { SimpleShardingStrategy } = require('discord.js');

const PLATFORMS = {
    vr: { os: 'android', browser: 'Discord VR', device: 'Discord VR' },
    mobile: { os: 'android', browser: 'Discord Android', device: 'Discord Android' },
};

function gatewayPlatformOptions(platform = process.env.BOT_PLATFORM || 'vr') {
    const key = String(platform).trim().toLowerCase();
    if (key === 'desktop' || key === 'default') return {};

    const properties = PLATFORMS[key];
    if (!properties) {
        console.warn(`Unknown BOT_PLATFORM "${platform}", using the default icon. Options: vr, mobile, desktop.`);
        return {};
    }

    return {
        buildStrategy(manager) {
            manager.options.identifyProperties = { ...properties };
            return new SimpleShardingStrategy(manager);
        },
    };
}

module.exports = { gatewayPlatformOptions };
