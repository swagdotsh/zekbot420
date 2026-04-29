const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    name: 'disconnectfm',
    aliases: ['unlinkfm', 'unfm', 'disconnectlastfm', 'unlinklastfm'    ],
    async execute(message) {
        const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${message.author.id}`

        if (!rows[0]) return message.reply("You don't have a Last.fm account linked!")

        await sql`DELETE FROM lastfm_connections WHERE discord_id = ${message.author.id}`

        message.reply(`✅ Disconnected your Last.fm account (**${rows[0].lastfm_username}**).`)
    }
}