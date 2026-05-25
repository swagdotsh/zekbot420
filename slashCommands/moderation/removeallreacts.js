const {
    SlashCommandBuilder,
    PermissionFlagsBits,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeallreacts')
        .setDescription('Remove all reactions from a message.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option
                .setName('message_id')
                .setDescription('The ID of the message to remove all reactions from.')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.guild) return;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: 'You need the `Manage Messages` permission to use this command. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: 'I need the `Manage Messages` permission to remove all reactions. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        const messageId = interaction.options.getString('message_id', true);

        let targetMessage;

        try {
            targetMessage = await interaction.channel.messages.fetch(messageId);
        } catch {
            return interaction.reply({
                content: 'I could not find a message with that ID in this channel. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }

        try {
            await targetMessage.reactions.removeAll();

            return interaction.reply({
                content: '✅ Removed all reactions from that message.',
                ephemeral: true,
            });
        } catch (err) {
            console.error(err);

            return interaction.reply({
                content: 'Failed to remove all reactions from that message. <:smirk2:1498272372539785286>',
                ephemeral: true,
            });
        }
    },
};