const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { logUntimeout } = require('../../log');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove a timeout from a member')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to remove timeout from')
                .setRequired(true)
        ),

    async execute(interaction) {
        const target = interaction.options.getMember('user');

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't untimeout yourself.",
                ephemeral: true
            });
        }

        if (!target.communicationDisabledUntil) {
            return interaction.reply({
                content: `**${target.user.tag}** is not currently timed out.`,
                ephemeral: true
            });
        }

        try {
            await target.timeout(null);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('Timeout Removed')
                .setDescription(`Your timeout has been removed in **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Unmuted By', value: interaction.user.tag, inline: true },
                    { name: 'Unmuted On', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: `Server ID: ${interaction.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch((err) => {
                console.error('Error sending untimeout DM:', err);
            });

            await logUntimeout(interaction.client, interaction.guild, target, interaction.user);

            return interaction.reply('👍');
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'There was an error removing the timeout.',
                ephemeral: true
            });
        }
    }
};