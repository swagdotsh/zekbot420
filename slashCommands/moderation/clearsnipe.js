const {
    SlashCommandBuilder,
    InteractionContextType,
    PermissionFlagsBits
} = require('discord.js');
const { logSnipeClear } = require('../../log');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearsnipe')
        .setDescription('Clear snipe data for this channel')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const channel = interaction.channel;
        const snipeData = interaction.client.snipes.get(channel.id);

        if (!snipeData) {
            return interaction.reply({
                content: 'No snipe data to clear in this channel.',
                ephemeral: true
            });
        }

        interaction.client.snipes.delete(channel.id);

        await logSnipeClear(interaction.client, interaction, interaction.user);

        return interaction.reply('✅');
    }
};