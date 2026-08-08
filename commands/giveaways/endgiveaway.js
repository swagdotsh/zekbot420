const { neon } = require('@neondatabase/serverless')
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

const sql = neon(process.env.NEON_DATABASE_URL)

module.exports = {
    name: 'endgiveaway',
    aliases: ['endg'],
    async execute(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply('You need mod permissions to end a giveaway.')
        }

        const id = parseInt(args[0])
        if (!id) return message.reply('Usage: `,endgiveaway <giveaway ID>`')

        const [giveaway] = await sql`
      SELECT * FROM giveaways WHERE id = ${id} AND guild_id = ${message.guild.id}
    `

        if (!giveaway) return message.reply(`No giveaway found with ID **${id}**.`)
        if (giveaway.ended) return message.reply('That giveaway has already ended.')

        const entries = await sql`SELECT user_id FROM giveaway_entries WHERE giveaway_id = ${id}`

        if (entries.length === 0) {
            await sql`UPDATE giveaways SET ended = TRUE WHERE id = ${id}`

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
                    await msg.edit({ components: [disabledRow] })
                }
            }

            return message.reply(`Giveaway **${giveaway.title}** ended with no entries.`)
        }

        const winner = entries[Math.floor(Math.random() * entries.length)]

        await sql`UPDATE giveaways SET ended = TRUE, winner_id = ${winner.user_id} WHERE id = ${id}`

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
                await msg.edit({ components: [disabledRow] })
            }

            await channel.send({
                content: `🎉 <@${winner.user_id}> won the **${giveaway.title}** giveaway! Congratulations!`
            })
        }

        if (giveaway.dm_winner) {
            const user = await message.client.users.fetch(winner.user_id).catch(() => null)
            if (user) {
                user.send(`🎉 You won the **${giveaway.title}** giveaway in **${message.guild.name}**! Congratulations!`).catch(() => null)
            }
        }

        message.reply(`Giveaway **${giveaway.title}** ended. Winner: <@${winner.user_id}>`)
    }
}