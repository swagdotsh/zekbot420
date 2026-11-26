require('dotenv').config();
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');

const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) {
    console.error('Set DISCORD_CLIENT_ID in your .env first.');
    process.exit(1);
}

const FEATURE_PERMISSIONS = [
    P.ViewChannel, P.SendMessages, P.SendMessagesInThreads, P.EmbedLinks, P.AttachFiles,
    P.ReadMessageHistory, P.AddReactions, P.UseExternalEmojis,
    P.BanMembers, P.KickMembers, P.ModerateMembers, P.ManageMessages, P.ManageNicknames,
    P.ManageRoles, P.ViewAuditLog,
    P.ManageGuild, P.ManageChannels, P.ManageGuildExpressions,
    P.Connect, P.Speak, P.MoveMembers,
];

const useAdmin = process.argv.includes('--admin');
const permissions = useAdmin
    ? PermissionsBitField.Flags.Administrator.toString()
    : new PermissionsBitField(FEATURE_PERMISSIONS).bitfield.toString();

const params = new URLSearchParams({ client_id: clientId, permissions, scope: 'bot applications.commands' });
const inviteLink = `https://discord.com/oauth2/authorize?${params}`;

console.log('Your bot invite link:');
console.log(inviteLink);
console.log(`Permissions set: ${useAdmin ? 'Administrator' : 'only what the bot uses (pass --admin for Administrator)'}`);

if (process.argv.includes('--copy')) {
    const { execSync } = require('child_process');
    const clipboardCmd = { win32: 'clip', darwin: 'pbcopy' }[process.platform]
        || (process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip -selection clipboard');
    try {
        execSync(clipboardCmd, { input: inviteLink });
        console.log('Copied to clipboard!');
    } catch {
        console.log(`Couldn't copy to clipboard (${clipboardCmd} not available), copy the link above manually.`);
    }
}
