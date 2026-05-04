const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { logBan } = require('../../log');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to ban')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for the ban')
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

        if (!target.bannable) {
            return interaction.reply({
                content: 'I can’t ban that user.',
                ephemeral: true
            });
        }

        try {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Ban')
                .setDescription(`You’ve been banned from **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Banned By', value: interaction.user.tag, inline: true },
                    { name: 'Banned At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Server ID: ${interaction.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch((err) => {
                console.error('Error sending DM to user:', err);
            });

            await target.ban({ reason });

            await logBan(interaction.client, interaction.guild, target, interaction.user, reason);

            return interaction.reply(`✌️ ${target.user.tag} has been banned.`);
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Failed to ban the user.',
                ephemeral: true
            });
        }
    }
};