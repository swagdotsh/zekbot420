const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { logKick } = require('../../log');
const { canModerate } = require('../../hierarchy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to kick')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason specified';

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                ephemeral: true
            });
        }

        if (!target.kickable) {
            return interaction.reply({
                content: 'I can’t kick that user.',
                ephemeral: true
            });
        }

        if (!canModerate(interaction.member, target)) {
            return interaction.reply({
                content: "You can't kick someone with the same or higher role than you. <:smirk2:1498272372539785286>",
                ephemeral: true
            });
        }

        try {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Kick')
                .setDescription(`You’ve been kicked from **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Mod', value: interaction.user.tag, inline: true },
                    { name: 'Kicked on', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Server ID: ${interaction.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch((err) => {
                console.error('Error sending DM to user:', err);
            });

            await target.kick(reason);

            await logKick(interaction.client, interaction.guild, target.user, interaction.user, reason);

            return interaction.reply(`✌️`);
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Failed to kick the user.',
                ephemeral: true
            });
        }
    }
};