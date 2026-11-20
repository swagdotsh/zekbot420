const { ChannelType, MessageFlags, PermissionsBitField } = require('discord.js');
const vm = require('../../commands/voicemaster/vmManager');

const SMIRK = '<:smirk2:1498272372539785286>';

async function setupVoiceMaster(interaction) {
    const me = interaction.guild.members.me;
    if (!me || !interaction.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({
            content: `I need **Manage Channels** permission to set up VoiceMaster. ${SMIRK}`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const category = interaction.options.getChannel('category');
    const result = await vm.createJoinChannel(
        interaction.client,
        interaction.guild,
        category?.type === ChannelType.GuildCategory ? category : null,
        interaction.user.tag,
    );

    return interaction.reply({
        content: result.error ?? `VoiceMaster has been set up. Users can join ${result.joinChannel} to create a temporary VC.`,
        flags: MessageFlags.Ephemeral,
    });
}

async function unsetupVoiceMaster(interaction) {
    const removed = await vm.removeVoiceMaster(interaction.client, interaction.guild, interaction.user.tag);
    return interaction.reply({
        content: removed
            ? 'VoiceMaster has been unsetup, its temporary VCs were deleted, and its configuration was removed.'
            : 'VoiceMaster is not currently set up on this server.',
        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    setupVoiceMaster,
    unsetupVoiceMaster,
    getManagedChannel: vm.getManagedChannel,
    isManagedChannel: vm.isManagedChannel,
    isVoiceMasterOrStaff: vm.isVoiceMasterOrStaff,
    deleteManagedChannel: vm.deleteManagedChannel,
};
