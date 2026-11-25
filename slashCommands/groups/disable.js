const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { defineGroup } = require('../../commandGroup');
const { getConfig: getSocialConfig, setConfig: setSocialConfig } = require('../../socialEmbeds');
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
        simple('starboard', 'Turn off the starboard and delete its settings', PermissionFlagsBits.ManageGuild, (i) => starboard.runOff(i)),
        { name: 'voicemaster', description: 'Remove the Join to Create channel and VoiceMaster settings', module: require('../voicemaster/unsetupvm') },
        simple('welcome', 'Stop sending welcome messages (your custom message is kept)', PermissionFlagsBits.ManageGuild, (i) => welcome.runDisable(i)),
    ],
});
