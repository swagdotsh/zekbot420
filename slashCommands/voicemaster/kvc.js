const {
    SlashCommandBuilder,
    InteractionContextType
} = require('discord.js');
const {
    getManagedChannel,
    isVoiceMasterOrStaff
} = require('./_vmManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kvc')
        .setDescription('Kick a user from your VoiceMaster VC')
        .setContexts(InteractionContextType.Guild)
        .addUserOption((opt) =>
            opt
                .setName('user')
                .setDescription('The user to kick from your VC')
                .setRequired(true)
        ),

    async execute(interaction) {
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: 'You need to be in a VoiceMaster VC to use this command.',
                ephemeral: true
            });
        }

        const managed = getManagedChannel(interaction.client, voiceChannel.id);

        if (!managed) {
            return interaction.reply({
                content: 'This is not a VoiceMaster VC.',
                ephemeral: true
            });
        }

        if (!isVoiceMasterOrStaff(interaction.member, managed)) {
            return interaction.reply({
                content: 'Only the voicemaster or staff with **Manage Channels** can use this command.',
                ephemeral: true
            });
        }

        const target = interaction.options.getMember('user');

        if (!target) {
            return interaction.reply({
                content: 'That user is not in this server.',
                ephemeral: true
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot kick yourself from the VC with this command.',
                ephemeral: true
            });
        }

        if (target.voice?.channelId !== voiceChannel.id) {
            return interaction.reply({
                content: 'That user is not in your VoiceMaster VC.',
                ephemeral: true
            });
        }

        await target.voice.disconnect(`Kicked from VoiceMaster VC by ${interaction.user.tag}`);

        return interaction.reply(`Kicked **${target.displayName}** from the VC.`);
    }
};