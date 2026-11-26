const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');
const { getConfig: getSocialConfig, setConfig: setSocialConfig } = require('../../socialEmbeds');
const { store: confessionStore } = require('../../confessions');
const { store: bumpStore } = require('../../bumpReminders');
const { getMessageConfig, updateMessageConfig } = require('../../welcomeStore');
const colorRoles = require('../../colorRoles');
const { store: streakStore } = require('../../streaks');
const { ok, fail } = require('../../ui');

const modlog = require('../moderation/modlog');
const starboard = require('../moderation/starboard');
const welcome = require('../moderation/welcomesetup');

const simple = (name, description, perms, execute) => ({
    name,
    description,
    json: { options: [], default_member_permissions: perms.toString() },
    execute,
});

module.exports = defineGroup({
    name: 'disable',
    description: 'Turn off zekbot420 features',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    children: [
        simple('boost', 'Stop sending boost messages (your custom message and booster perks are kept)', PermissionFlagsBits.ManageGuild, async (interaction) => {
            const current = await getMessageConfig(interaction.guild.id, 'boost');
            if (!current.channelId) return interaction.reply({ content: fail('Boost messages are not set up in this server.'), flags: MessageFlags.Ephemeral });
            await updateMessageConfig(interaction.guild.id, 'boost', (config) => { config.channelId = null; });
            return interaction.reply({ content: ok('Boost messages are off. Booster perks still work; manage them with `/boostperks`.'), flags: MessageFlags.Ephemeral });
        }),
        simple('bumpreminder', 'Stop bump reminders', PermissionFlagsBits.ManageGuild, async (interaction) => {
            const current = await bumpStore.get(interaction.guild.id);
            if (!current.enabled) return interaction.reply({ content: fail('Bump reminders are already off.'), flags: MessageFlags.Ephemeral });
            await bumpStore.update(interaction.guild.id, (data) => { data.enabled = false; data.pending = {}; });
            return interaction.reply({ content: ok('Bump reminders are off.'), flags: MessageFlags.Ephemeral });
        }),
        simple('colorroles', 'Delete the color panel (the color roles and list are kept)', PermissionFlagsBits.ManageRoles, async (interaction) => {
            const current = await colorRoles.store.get(interaction.guild.id);
            if (!current.channelId) return interaction.reply({ content: fail('There\'s no color panel in this server.'), flags: MessageFlags.Ephemeral });
            await colorRoles.disablePanel(interaction.guild);
            return interaction.reply({ content: ok('Deleted the color panel. The roles are kept, so `/setup colorroles` brings it back.'), flags: MessageFlags.Ephemeral });
        }),
        simple('confessions', 'Stop accepting anonymous confessions (numbering and bans are kept)', PermissionFlagsBits.ManageGuild, async (interaction) => {
            const current = await confessionStore.get(interaction.guild.id);
            if (!current.channelId) return interaction.reply({ content: fail('Confessions are not set up in this server.'), flags: MessageFlags.Ephemeral });
            await confessionStore.update(interaction.guild.id, (data) => { data.channelId = null; });
            return interaction.reply({ content: ok('Confessions are off. Existing confessions stay where they are.'), flags: MessageFlags.Ephemeral });
        }),
        simple('goodbye', 'Stop sending goodbye messages (your custom message is kept)', PermissionFlagsBits.ManageGuild, async (interaction) => {
            const current = await getMessageConfig(interaction.guild.id, 'goodbye');
            if (!current.channelId) return interaction.reply({ content: fail('Goodbye messages are not set up in this server.'), flags: MessageFlags.Ephemeral });
            await updateMessageConfig(interaction.guild.id, 'goodbye', (config) => { config.channelId = null; });
            return interaction.reply({ content: ok('Goodbye messages are off. Your custom message is saved for when you run `/setup goodbye` again.'), flags: MessageFlags.Ephemeral });
        }),
        { name: 'jail', description: 'Remove the jail role, channel and settings', module: require('../moderation/jail/unsetupjail') },
        simple('modlog', 'Stop sending moderation logs', PermissionFlagsBits.Administrator, (i) => modlog.runDisable(i)),
        simple('socialembeds', 'Stop replying to X and Instagram links', PermissionFlagsBits.ManageGuild, async (interaction) => {
            const current = await getSocialConfig(interaction.guild.id);
            if (!current.enabled) {
                return interaction.reply({ content: fail('Social embeds are already off.'), flags: MessageFlags.Ephemeral });
            }
            await setSocialConfig(interaction.guild.id, { enabled: false });
            return interaction.reply({ content: ok('Social embeds are off.'), flags: MessageFlags.Ephemeral });
        }),
        simple('streaks', 'Stop tracking and announcing message streaks (streaks so far are kept)', PermissionFlagsBits.ManageGuild, async (interaction) => {
            const current = await streakStore.get(interaction.guild.id);
            if (!current.channelId) return interaction.reply({ content: fail('Streaks are already off.'), flags: MessageFlags.Ephemeral });
            await streakStore.update(interaction.guild.id, (data) => { data.channelId = null; });
            return interaction.reply({ content: ok('Streaks are off. Turning them back on later keeps everyone\'s best streak, but current streaks will have broken.'), flags: MessageFlags.Ephemeral });
        }),
        simple('starboard', 'Turn off the starboard and delete its settings', PermissionFlagsBits.ManageGuild, (i) => starboard.runOff(i)),
        { name: 'voicemaster', description: 'Remove the Join to Create channel and VoiceMaster settings', module: require('../voicemaster/unsetupvm') },
        simple('welcome', 'Stop sending welcome messages (your custom message is kept)', PermissionFlagsBits.ManageGuild, (i) => welcome.runDisable(i)),
    ],
});
