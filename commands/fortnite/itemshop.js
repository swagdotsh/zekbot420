const axios = require('axios');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const FNBR_KEY = process.env.FNBR_API_KEY;
const PAGE_SIZE = 10;

const RARITY_COLORS = {
    common: 0x9d9d9d,
    uncommon: 0x3fc95a,
    rare: 0x4d94ff,
    epic: 0xa855f7,
    legendary: 0xf5a623,
    mythic: 0xf7d700,
    exotic: 0x87f0c4,
};

function buildEmbed(items, page, totalPages, date, section) {
    const label = section === 'daily' ? '📅 Daily' : '⭐ Featured';
    const start = page * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);
    const topItem = items[0];
    const color = RARITY_COLORS[topItem?.rarity] || 0x1dbfff;

    return {
        color,
        title: `🛒 Fortnite Item Shop — ${date}`,
        fields: [{
            name: label,
            value: pageItems.map(i => `**${i.name}** — ${i.readableType} • ${i.price} V-Bucks`).join('\n')
        }],
        footer: { text: `Page ${page + 1}/${totalPages} • Powered by fnbr.co` },
        timestamp: new Date()
    };
}

function buildRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('prev')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('next')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId('close')
            .setEmoji('✖️')
            .setStyle(ButtonStyle.Danger)
    );
}

module.exports = {
    name: 'itemshop',
    aliases: ['fnshop', 'is'],
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
            const items = section === 'daily' ? (daily || []) : (featured || []);

            if (!items.length) return message.reply('No items found for that section.');

            let page = 0;
            const totalPages = Math.ceil(items.length / PAGE_SIZE);

            const reply = await message.reply({
                embeds: [buildEmbed(items, page, totalPages, shopDate, section || 'featured')],
                components: totalPages > 1 ? [buildRow(page, totalPages)] : []
            });

            if (totalPages <= 1) return;

            const collector = reply.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 60_000
            });

            collector.on('collect', async i => {
                if (i.customId === 'close') return collector.stop('closed');
                if (i.customId === 'prev') page--;
                if (i.customId === 'next') page++;

                await i.update({
                    embeds: [buildEmbed(items, page, totalPages, shopDate, section || 'featured')],
                    components: [buildRow(page, totalPages)]
                });
            });

            collector.on('end', async (_, reason) => {
                await reply.edit({ components: [] }).catch(() => {});
            });

        } catch (err) {
            console.error(err.response?.data || err.message);
            await message.reply('Failed to fetch the item shop. Try again later.');
        }
    }
};