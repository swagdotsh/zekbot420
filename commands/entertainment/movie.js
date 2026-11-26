const { currentPrefix } = require('../../prefix');
const tmdb = require('../../tmdb');
const { fail, loading } = require('../../ui');

function createPrefixLookup(type, name, aliases) {
    return {
        name,
        aliases,
        cooldown: 4,
        async execute(message, args) {
            const noun = type === 'movie' ? 'movie' : 'show';
            if (!args.length) return message.reply(`Usage: \`${currentPrefix()}${name} <${noun} title>\`, like \`${currentPrefix()}${name} ${type === 'movie' ? 'Interstellar' : 'Breaking Bad'}\``);
            if (!tmdb.isConfigured()) return message.reply(fail('Movie and show lookups aren\'t set up on this bot yet.'));
            const status = await message.reply({ content: loading(`Searching TMDB for that ${noun}...`), allowedMentions: { repliedUser: false } });
            try {
                const result = await tmdb.lookup(type, args.join(' '));
                if (result.error) return status.edit(fail(result.error));
                return status.edit({ content: '', ...result });
            } catch (error) {
                console.error(`[tmdb] ,${name} failed:`, error);
                return status.edit(fail(error instanceof tmdb.TmdbError ? error.message : 'Couldn\'t reach TMDB right now. Try again in a moment.'));
            }
        },
    };
}

module.exports = createPrefixLookup('movie', 'movie', ['film']);
module.exports.createPrefixLookup = createPrefixLookup;
