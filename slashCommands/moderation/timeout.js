const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    EmbedBuilder
} = require('discord.js');
const { logTimeout } = require('../../log');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a member from the server')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to timeout')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('duration')
                .setDescription('Timeout duration, for example 1m, 1h, or 1d')
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName('reason')
                .setDescription('Reason for the timeout')
                .setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const timeArg = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason specified';

        if (!target) {
            return interaction.reply({
                content: 'User not found in this server.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: "You can't timeout yourself.",
                ephemeral: true
            });
        }

        const time = parseDuration(timeArg);

        if (!time) {
            return interaction.reply({
                content: 'Please provide a valid duration for the timeout, for example `1m`, `1h`, or `1d`.',
                ephemeral: true
            });
        }

        try {
            await target.timeout(time, reason);

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('Timeout')
                .setDescription(`You have been timed out in **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Muted By', value: interaction.user.tag, inline: true },
                    { name: 'Muted At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Duration', value: timeArg, inline: true }
                )
                .setFooter({ text: `Server ID: ${interaction.guild.id}` })
                .setTimestamp();

            await target.send({ embeds: [embed] }).catch((err) => {
                console.error('Error sending timeout DM:', err);
            });

            await logTimeout(interaction.client, interaction.guild, target, interaction.user, reason, timeArg);

            return interaction.reply(`<:timeout:1370370278873497710>`);
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'There was an error executing the timeout.',
                ephemeral: true
            });
        }
    }
};

function parseDuration(duration) {
    if (!duration) return null;

    const timeRegex = /^(\d+)(m|h|d)$/;
    const match = duration.match(timeRegex);

    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        default:
            return null;
    }
}