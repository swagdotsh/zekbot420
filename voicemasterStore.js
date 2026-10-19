// Saves VoiceMaster temp VCs to disk so they're still managed (and cleaned up) after a restart.
// Shared by the prefix and slash VoiceMaster managers, which both keep their channels in client.voiceMaster.channels.

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(process.cwd(), 'data', 'voicemaster_channels.json');

// A Map that writes itself to disk whenever a channel is added or removed
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

    // writes are queued so quick changes can't finish out of order, and each one saves whatever is current by then
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
