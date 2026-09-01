const { neon } = require('@neondatabase/serverless')
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    name: 'deletegiveaway',
    aliases: ['dg'],
    async execute(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply('You need mod permissions to delete a giveaway. <:smirk2:1498272372539785286>')
        }

        const id = parseInt(args[0])
        if (!id) return message.reply('Usage: `,deletegiveaway <giveaway ID>`')

        const [giveaway] = await sql`
      SELECT * FROM giveaways WHERE id = ${id} AND guild_id = ${message.guild.id}
    `

        if (!giveaway) return message.reply(`No giveaway found with ID **${id}**.`)
        if (giveaway.ended) return message.reply('That giveaway has already ended.')

        await sql`DELETE FROM giveaways WHERE id = ${id}`

        const channel = message.guild.channels.cache.get(giveaway.channel_id)
        if (channel && giveaway.message_id) {
            const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null)
            if (msg) {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`giveaway_enter_${id}`)
                        .setLabel('🎉 Enter')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true)
                )
                await msg.edit({
                    embeds: [{
                        color: 0xed4245,
                        title: `❌ ${giveaway.title}`,
                        description: 'This giveaway was cancelled.',
                        footer: { text: `Giveaway ID: ${id}` }
                    }],
                    components: [disabledRow]
                })
            }
        }

        message.reply(`Giveaway **${giveaway.title}** has been deleted. No winner was picked.`)
    }
}
