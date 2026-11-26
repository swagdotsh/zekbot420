const { ChannelType, MessageFlags, PermissionsBitField } = require('discord.js');
const vm = require('../../commands/voicemaster/vmManager');
const { ok, fail } = require('../../ui');

async function setupVoiceMaster(interaction) {
    const me = interaction.guild.members.me;
    if (!me || !interaction.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageChannels)) {
        return interaction.reply({
            content: fail('I need the `Manage Channels` permission to set up VoiceMaster.'),
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
        content: result.error ?? ok(`VoiceMaster is set up. Members can join ${result.joinChannel} to create a temporary VC.`),
        flags: MessageFlags.Ephemeral,
    });
}

async function unsetupVoiceMaster(interaction) {
    const removed = await vm.removeVoiceMaster(interaction.client, interaction.guild, interaction.user.tag);
    return interaction.reply({
        content: removed
            ? ok('VoiceMaster has been removed. Its temporary VCs and settings were deleted.')
            : fail('VoiceMaster is not set up in this server.'),
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
