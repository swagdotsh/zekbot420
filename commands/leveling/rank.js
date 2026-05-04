const { getUser, getConfig } = require('../../leveling');

function xpForNextLevel(level) {
    return 500 * (level + 1);
}

module.exports = {
    name: 'rank',
    aliases: ['level', 'lvl', 'levels'],
    async execute(message, args) {
        const target = message.mentions.users.first() || message.author;
        const data = await getUser(message.guild.id, target.id);

        if (!data) {
            return message.reply(target.id === message.author.id
                ? "You haven't earned any XP yet. Start chatting!"
                : "That user hasn't earned any XP yet."
            );
        }

        const nextLevelXp = xpForNextLevel(data.level);

        await message.reply({
            embeds: [{
                color: 0x5865f2,
                author: { name: target.username, icon_url: target.displayAvatarURL() },
                fields: [
                    { name: 'Level', value: `${data.level}`, inline: true },
                    { name: 'XP', value: `${data.xp} / ${nextLevelXp}`, inline: true }
                ]
            }]
        });
    }
};