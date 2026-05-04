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
        .setName('rmvc')
        .setDescription('Rename your VoiceMaster VC')
        .setContexts(InteractionContextType.Guild)
        .addStringOption((opt) =>
            opt
                .setName('name')
                .setDescription('New VC name. Leave blank to reset to the default name.')
                .setRequired(false)
                .setMaxLength(100)
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

        const newNameInput = interaction.options.getString('name')?.trim() || '';
        let newName = newNameInput;

        if (!newNameInput) {
            const owner = await interaction.guild.members.fetch(managed.ownerId).catch(() => null);
            const ownerName = owner?.displayName || 'User';

            newName = `${ownerName}'s VC`;
        }

        if (newName.length > 100) {
            return interaction.reply({
                content: 'VC name must be **100 characters or fewer**.',
                ephemeral: true
            });
        }

        await voiceChannel.setName(newName, `VoiceMaster VC renamed by ${interaction.user.tag}`);

        if (!newNameInput) {
            return interaction.reply(`VC name reset to **${newName}**.`);
        }

        return interaction.reply(`VC renamed to **${newName}**.`);
    }
};