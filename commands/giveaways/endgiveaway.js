const { PermissionFlagsBits } = require('discord.js')

const { sql } = require('../../db');
const { endGiveaway } = require('../../events/giveawayManager');

module.exports = {
    name: 'endgiveaway',
    aliases: ['endg'],
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('You need mod permissions to end a giveaway. <:smirk2:1498272372539785286>')
        }

        const id = parseInt(args[0])
        if (!id) return message.reply(`Usage: \`${process.env.PREFIX}endgiveaway <giveaway ID>\``)

        const [giveaway] = await sql`
      SELECT * FROM giveaways WHERE id = ${id} AND guild_id = ${message.guild.id}
    `

        if (!giveaway) return message.reply(`No giveaway found with ID **${id}**.`)
        if (giveaway.ended) return message.reply('That giveaway has already ended.')

        await endGiveaway(message.client, giveaway)

        const [ended] = await sql`SELECT winner_id FROM giveaways WHERE id = ${id}`
        return message.reply({
            content: ended?.winner_id
                ? `Giveaway **${giveaway.title}** ended. Winner: <@${ended.winner_id}>`
                : `Giveaway **${giveaway.title}** ended with no winner.`,
            allowedMentions: { parse: [] },
        })
    }
}
