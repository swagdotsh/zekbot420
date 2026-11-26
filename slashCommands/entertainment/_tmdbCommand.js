const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const tmdb = require('../../tmdb');
const { fail } = require('../../ui');

function createTmdbCommand(type) {
    const noun = type === 'movie' ? 'movie' : 'TV show';
    return {
        cooldown: 4,
        data: new SlashCommandBuilder()
            .setName(type === 'movie' ? 'movie' : 'show')
            .setDescription(`Look up a ${noun}: plot, rating, cast and where to watch`)
            .setIntegrationTypes(0, 1)
            .setContexts(0, 1, 2)
            .addStringOption((opt) =>
                opt.setName('title').setDescription(`The ${noun} to look up (pick one from the list or type a title)`)
                    .setRequired(true).setMaxLength(100).setAutocomplete(true)),

        async autocomplete(interaction) {
            const query = interaction.options.getFocused();
            const choices = await tmdb.suggestions(type, query).catch(() => []);
            await interaction.respond(choices).catch(() => {});
        },

        async execute(interaction) {
            if (!tmdb.isConfigured()) {
                return interaction.reply({ content: fail('Movie and show lookups aren\'t set up on this bot yet.'), flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply({ loadingText: `Searching TMDB for that ${noun}...` });
            try {
                const result = await tmdb.lookup(type, interaction.options.getString('title', true));
                if (result.error) return interaction.editReply(fail(result.error));
                return interaction.editReply({ content: '', ...result });
            } catch (error) {
                console.error(`[tmdb] /${type} failed:`, error);
                return interaction.editReply(fail(error instanceof tmdb.TmdbError ? error.message : 'Couldn\'t reach TMDB right now. Try again in a moment.'));
            }
        },
    };
}

module.exports = { createTmdbCommand };
