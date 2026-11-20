const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    MessageFlags
} = require('discord.js');

const { sql } = require('../../db');
const { endGiveaway } = require('../../events/giveawayManager');

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
                content: 'You need mod permissions to end a giveaway. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral
            });
        }

        const id = interaction.options.getInteger('giveaway_id', true);

        const [giveaway] = await sql`
            SELECT * FROM giveaways WHERE id = ${id} AND guild_id = ${interaction.guild.id}
        `;

        if (!giveaway) {
            return interaction.reply({ content: `No giveaway found with ID **${id}**.`, flags: MessageFlags.Ephemeral });
        }

        if (giveaway.ended) {
            return interaction.reply({ content: 'That giveaway has already ended.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();
        await endGiveaway(interaction.client, giveaway);

        const [ended] = await sql`SELECT winner_id FROM giveaways WHERE id = ${id}`;
        return interaction.editReply({
            content: ended?.winner_id
                ? `Giveaway **${giveaway.title}** ended. Winner: <@${ended.winner_id}>`
                : `Giveaway **${giveaway.title}** ended with no winner.`,
            allowedMentions: { parse: [] }
        });
    }
};
