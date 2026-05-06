const axios = require('axios');

const FNBR_KEY = process.env.FNBR_API_KEY;

const RARITY_COLORS = {
    common: 0x9d9d9d,
    uncommon: 0x3fc95a,
    rare: 0x4d94ff,
    epic: 0xa855f7,
    legendary: 0xf5a623,
    mythic: 0xf7d700,
    exotic: 0x87f0c4,
};

const formatSection = (items) =>
    items.map(i => `**${i.name}** — ${i.readableType} • ${i.price} V-Bucks`).join('\n') || 'No items found.';

module.exports = {
    name: 'itemshop',
    aliases: ['shop', 'fnshop'],
    async execute(message, args) {
        const section = args[0]?.toLowerCase();
        if (section && !['featured', 'daily'].includes(section)) {
            return message.reply('Usage: `,itemshop` • `,itemshop featured` • `,itemshop daily`');
        }

        try {
            const res = await axios.get('https://fnbr.co/api/shop', {
                headers: { 'x-api-key': FNBR_KEY }
            });

            const { featured, daily, date } = res.data.data;
            const shopDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

            const isDaily = section === 'daily';
            const items = isDaily ? (daily || []) : (featured || []);
            const label = isDaily ? '📅 Daily' : '⭐ Featured';

            const topItem = items[0];
            const color = RARITY_COLORS[topItem?.rarity] || 0x1dbfff;
            const thumbnail = topItem?.images.featured || topItem?.images.icon;

            await message.reply({
                embeds: [{
                    color,
                    title: `🛒 Item Shop — ${shopDate}`,
                    thumbnail: thumbnail ? { url: thumbnail } : null,
                    fields: [{ name: label, value: formatSection(items).slice(0, 1024) }],
                    footer: { text: 'Powered by fnbr.co' },
                    timestamp: new Date()
                }]
            });
        } catch (err) {
            console.error(err.response?.data || err.message);
            await message.reply('Failed to fetch the item shop. Try again later.');
        }
    }
};