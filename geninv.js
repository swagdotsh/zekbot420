// Generates an invite link for the bot with administrator permissions. Make sure to set the DISCORD_CLIENT_ID environment variable before running this script.

// It's recommended that you use the official Discord Permissions Calculator for this instead of using this script. This file is hardcoded to use Administrator permissions.
// https://discordapi.com/permissions.html

require('dotenv').config();

const clientId = process.env.DISCORD_CLIENT_ID;
const permissions = 8;
const scopes = ['bot'];

const inviteLink = "https://discord.com/oauth2/authorize?client_id="+clientId+"&permissions="+permissions+"&scope="+scopes.join('%20');

console.log('Your bot invite link:');
console.log(inviteLink);
console.log('Permissions set: Administrator')