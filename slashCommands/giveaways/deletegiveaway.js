const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    MessageFlags
} = require('discord.js');

const { sql } = require('../../db');

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
        .setName('deletegiveaway')
        .setDescription('Delete/cancel an active giveaway')
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
                content: 'You need mod permissions to delete a giveaway. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral
            });
        }

        const id = interaction.options.getInteger('giveaway_id', true);

        const [giveaway] = await sql`
            SELECT * FROM giveaways WHERE id = ${id} AND guild_id = ${interaction.guild.id}
        `;

        if (!giveaway) {
            return interaction.reply({
                content: `No giveaway found with ID **${id}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (giveaway.ended) {
            return interaction.reply({
                content: 'That giveaway has already ended.',
                flags: MessageFlags.Ephemeral
            });
        }

        await sql`DELETE FROM giveaways WHERE id = ${id}`;

        const channel = interaction.guild.channels.cache.get(giveaway.channel_id);

        if (channel && giveaway.message_id) {
            const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);

            if (msg) {
                await msg.edit({
                    embeds: [{
                        color: 0xed4245,
                        title: `❌ ${giveaway.title}`,
                        description: 'This giveaway was cancelled.',
                        footer: { text: `Giveaway ID: ${id}` }
                    }],
                    components: [disabledGiveawayButton(id)]
                });
            }
        }

        return interaction.reply({
            content: `Giveaway **${giveaway.title}** has been deleted. No winner was picked.`
        });
    }
};
