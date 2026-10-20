const fs = require('fs');
const path = require('path');

const FILE = path.resolve(process.cwd(), 'data', 'voicemaster_channels.json');

class ManagedChannelMap extends Map {
    set(key, value) {
        super.set(key, value);
        this.save();
        return this;
    }

    delete(key) {
        const existed = super.delete(key);
        if (existed) this.save();
        return existed;
    }

    save() {
        this.pendingSave = (this.pendingSave ?? Promise.resolve())
            .then(async () => {
                await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
                await fs.promises.writeFile(FILE, JSON.stringify([...this.values()], null, 2), 'utf8');
            })
            .catch((error) => console.error('Failed to save VoiceMaster channels:', error));
    }
}

function loadManagedChannels() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        return Array.isArray(parsed) ? parsed.filter(entry => entry?.channelId) : [];
    } catch {
        return [];
    }
}

module.exports = { ManagedChannelMap, loadManagedChannels };
