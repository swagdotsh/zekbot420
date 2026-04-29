const { SlashCommandBuilder } = require('discord.js');
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('disconnectfm')
        .setDescription('Disconnect your Last.fm account from Discord')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        await interaction.deferReply();

        const rows = await sql`SELECT lastfm_username FROM lastfm_connections WHERE discord_id = ${interaction.user.id}`

        if (!rows[0]) {
            return interaction.editReply("You don't have a Last.fm account linked!");
        }

        await sql`DELETE FROM lastfm_connections WHERE discord_id = ${interaction.user.id}`

        return interaction.editReply(`✅ Disconnected your Last.fm account (**${rows[0].lastfm_username}**).`);
    }
};

