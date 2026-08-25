const { neon } = require('@neondatabase/serverless');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType
} = require('discord.js');

const sql = neon(process.env.NEON_DATABASE_URL);

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;

    const val = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

    return val * multipliers[unit];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('startgiveaway')
        .setDescription('Start a giveaway')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption((opt) =>
            opt
                .setName('duration')
                .setDescription('Duration of the giveaway, e.g. 10m, 2h, 1d')
                .setRequired(true)
        )
        .addBooleanOption((opt) =>
            opt
                .setName('dm_winner')
                .setDescription('Whether to DM the winner')
                .setRequired(true)
        )
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('Channel to post the giveaway in')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('title')
                .setDescription('Giveaway title/prize')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: 'You need mod permissions to start a giveaway.',
                ephemeral: true
            });
        }

        const durationArg = interaction.options.getString('duration', true).toLowerCase();
        const duration = parseDuration(durationArg);

        if (!duration) {
            return interaction.reply({
                content: 'Invalid duration. Use format like `10m`, `2h`, or `1d`.',
                ephemeral: true
            });
        }

        const dmWinner = interaction.options.getBoolean('dm_winner', true);
        const channel = interaction.options.getChannel('channel', true);
        const title = interaction.options.getString('title', true).trim();

        if (!title) {
            return interaction.reply({
                content: 'Giveaway title cannot be empty.',
                ephemeral: true
            });
        }

        const endsAt = new Date(Date.now() + duration);

        const [row] = await sql`
            INSERT INTO giveaways (guild_id, channel_id, title, ends_at, dm_winner, created_by)
            VALUES (${interaction.guild.id}, ${channel.id}, ${title}, ${endsAt}, ${dmWinner}, ${interaction.user.id})
            RETURNING id
        `;

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway_enter_${row.id}`)
                .setLabel('🎉 Enter')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = {
            color: 0x5865f2,
            title: `🎉 ${title}`,
            description: `Click the button below to enter!\n\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
            footer: { text: `Giveaway ID: ${row.id} • Started by ${interaction.user.tag}` }
        };

        const msg = await channel.send({
            embeds: [embed],
            components: [button]
        });

        await sql`UPDATE giveaways SET message_id = ${msg.id} WHERE id = ${row.id}`;

        return interaction.reply({
            content: `Giveaway **${title}** started in ${channel}! Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>.`,
            ephemeral: true
        });
    }
};