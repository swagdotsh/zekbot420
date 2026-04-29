const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const dbPath = path.join(__dirname, '../../data/lastfm.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('linklastfm')
        .setDescription('Link your Discord account to a Last.fm username')
        .addStringOption((opt) =>
            opt
                .setName('username')
                .setDescription('Your Last.fm username')
                .setRequired(true)
        )
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2),

    async execute(interaction) {
        const username = interaction.options.getString('username');

        if (!username) {
            return interaction.reply({
                content: 'Provide a Last.fm username!',
                ephemeral: true
            });
        }

        let db = {};

        if (fs.existsSync(dbPath)) {
            db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        }

        db[interaction.user.id] = username;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        return interaction.reply(`✅ Linked your account to **${username}** on Last.fm!`);
    }
};