require('dotenv').config();

const clientId = process.env.DISCORD_CLIENT_ID;
const permissions = 8;
const scopes = ['bot'];

const inviteLink = "https://discord.com/oauth2/authorize?client_id="+clientId+"&permissions="+permissions+"&scope="+scopes.join('%20');

console.log('Your bot invite link:');
console.log(inviteLink);
console.log('Permissions set: Administrator')