const axios = require('axios');
const {
    SlashCommandBuilder,
    InteractionContextType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

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
    data: new SlashCommandBuilder()
        .setName('itemshop')
        .setDescription('View the current Fortnite item shop')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        )
        .addStringOption(option =>
            option.setName('section')
                .setDescription('Which section to view (default: featured)')
                .addChoices(
                    { name: 'Featured', value: 'featured' },
                    { name: 'Daily', value: 'daily' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const section = interaction.options.getString('section') ?? 'featured';

        try {
            const res = await axios.get('https://fnbr.co/api/shop', {
                headers: { 'x-api-key': FNBR_KEY }
            });

            const { featured, daily, date } = res.data.data;
            const shopDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const items = section === 'daily' ? (daily || []) : (featured || []);

            if (!items.length) return interaction.editReply('No items found for that section.');

            let page = 0;
            const totalPages = Math.ceil(items.length / PAGE_SIZE);

            const reply = await interaction.editReply({
                embeds: [buildEmbed(items, page, totalPages, shopDate, section)],
                components: totalPages > 1 ? [buildRow(page, totalPages)] : []
            });

            if (totalPages <= 1) return;

            const collector = reply.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60_000
            });

            collector.on('collect', async i => {
                if (i.customId === 'close') return collector.stop('closed');
                if (i.customId === 'prev') page--;
                if (i.customId === 'next') page++;

                await i.update({
                    embeds: [buildEmbed(items, page, totalPages, shopDate, section)],
                    components: [buildRow(page, totalPages)]
                });
            });

            collector.on('end', async () => {
                await reply.edit({ components: [] }).catch(() => {});
            });

        } catch (err) {
            console.error(err.response?.data || err.message);
            return interaction.editReply('Failed to fetch the item shop. Try again later.');
        }
    }
};