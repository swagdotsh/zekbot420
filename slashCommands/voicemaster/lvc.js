const {
    SlashCommandBuilder,
    InteractionContextType,
    PermissionsBitField
} = require('discord.js');
const {
    getManagedChannel,
    isVoiceMasterOrStaff
} = require('./_vmManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lvc')
        .setDescription('Lock or unlock your VoiceMaster VC')
        .setContexts(InteractionContextType.Guild),

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

        const everyoneOverwrite = voiceChannel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const currentlyLocked = everyoneOverwrite?.deny?.has(PermissionsBitField.Flags.Connect) ?? false;

        await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: currentlyLocked ? null : false
        });

        return interaction.reply(
            currentlyLocked
                ? 'VC unlocked.\n-# Tip: To lock, run `/lvc` again.'
                : 'VC locked.\n-# Tip: To unlock, run `/lvc` again.'
        );
    }
};