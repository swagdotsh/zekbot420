const { neon } = require('@neondatabase/serverless');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType
} = require('discord.js');

const sql = neon(process.env.NEON_DATABASE_URL);

function disabledGiveawayButton(id) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveaway_enter_${id}`)
            .setLabel('🎉 Enter')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('endgiveaway')
        .setDescription('End a giveaway early and pick a winner')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption((opt) =>
            opt
                .setName('giveaway_id')
                .setDescription('The giveaway ID')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: 'You need mod permissions to end a giveaway.',
                ephemeral: true
            });
        }

        const id = interaction.options.getInteger('giveaway_id', true);

        const [giveaway] = await sql`
            SELECT * FROM giveaways WHERE id = ${id} AND guild_id = ${interaction.guild.id}
        `;

        if (!giveaway) {
            return interaction.reply({
                content: `No giveaway found with ID **${id}**.`,
                ephemeral: true
            });
        }

        if (giveaway.ended) {
            return interaction.reply({
                content: 'That giveaway has already ended.',
                ephemeral: true
            });
        }

        const entries = await sql`SELECT user_id FROM giveaway_entries WHERE giveaway_id = ${id}`;

        if (entries.length === 0) {
            await sql`UPDATE giveaways SET ended = TRUE WHERE id = ${id}`;

            const channel = interaction.guild.channels.cache.get(giveaway.channel_id);

            if (channel && giveaway.message_id) {
                const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);

                if (msg) {
                    await msg.edit({
                        components: [disabledGiveawayButton(id)]
                    });
                }
            }

            return interaction.reply({
                content: `Giveaway **${giveaway.title}** ended with no entries.`,
                ephemeral: false
            });
        }

        const winner = entries[Math.floor(Math.random() * entries.length)];

        await sql`
            UPDATE giveaways
            SET ended = TRUE, winner_id = ${winner.user_id}
            WHERE id = ${id}
        `;

        const channel = interaction.guild.channels.cache.get(giveaway.channel_id);

        if (channel && giveaway.message_id) {
            const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);

            if (msg) {
                await msg.edit({
                    components: [disabledGiveawayButton(id)]
                });
            }

            await channel.send({
                content: `🎉 <@${winner.user_id}> won the **${giveaway.title}** giveaway! Congratulations!`
            });
        }

        if (giveaway.dm_winner) {
            const user = await interaction.client.users.fetch(winner.user_id).catch(() => null);

            if (user) {
                user.send(`🎉 You won the **${giveaway.title}** giveaway in **${interaction.guild.name}**! Congratulations!`).catch(() => null);
            }
        }

        return interaction.reply({
            content: `Giveaway **${giveaway.title}** ended. Winner: <@${winner.user_id}>`,
            ephemeral: false
        });
    }
};