const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js")
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
  name: 'linklastfm',
  aliases: ['setfm', 'linkfm', 'connectfm'],
  async execute(message) {
    const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`

    if (rows[0]) {
      return message.reply(`You're already logged in as **${rows[0].lastfm_username}**!`)
    }

    const authUrl = `https://zekbot420.swagrelated.com/.netlify/functions/lastfm-auth?discord_id=${message.author.id}` // Replace with your own domain's auth function

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Log in with Last.fm')
            .setURL(authUrl)
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('Sign up')
            .setURL('https://www.last.fm/join')
            .setStyle(ButtonStyle.Link)
    )

    message.reply({ content: '**Connect your Last.fm**\nIf you have a last.fm account, you can link it to zekbot420 and access various music stat tracking related features!', components: [row] })
  }
}