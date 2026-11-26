const EMOJI = {
    smirk: '<:smirk2:1498272372539785286>',
    loading: '<a:spinbot420:1498959085427490937>',
    ok: '✅',
    x: '<:x_:1575426864107884574>',
    instagram: '<:insta:1575426628769808414>',
    shazam: '<:shazam:1575439633863675934>',
    appleMusic: '<:am:1575440259355774997>',
    spotify: '<:spotify:1561887506117689394>',
};

const emojiUrl = (emoji) => `https://cdn.discordapp.com/emojis/${emoji.match(/:(\d+)>$/)[1]}.png`;

const ok = (text) => `${EMOJI.ok} ${text}`;
const fail = (text) => `${text} ${EMOJI.smirk}`;
const loading = (text) => `${EMOJI.loading} ${text}`;

function showLoadingOnDefer(interaction, defaultText = 'Working on it...') {
    if (interaction.loadingPatched) return interaction;
    interaction.loadingPatched = true;

    const reply = interaction.reply.bind(interaction);
    const editReply = interaction.editReply.bind(interaction);
    let showingLoading = false;

    interaction.deferReply = async ({ loadingText, ...options } = {}) => {
        showingLoading = true;
        return reply({ ...options, content: loading(loadingText ?? defaultText), allowedMentions: { parse: [] } });
    };
    interaction.editReply = async (options) => {
        if (showingLoading && options && typeof options === 'object' && !('content' in options)) {
            options = { ...options, content: '' };
        }
        showingLoading = false;
        return editReply(options);
    };
    return interaction;
}

module.exports = { EMOJI, emojiUrl, ok, fail, loading, showLoadingOnDefer };
