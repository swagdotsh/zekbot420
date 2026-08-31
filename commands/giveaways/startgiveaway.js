const { neon } = require('@neondatabase/serverless')
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

const sql = neon(process.env.NEON_DATABASE_URL)

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/)
    if (!match) return null
    const val = parseInt(match[1])
    const unit = match[2]
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 }
    return val * multipliers[unit]
}

module.exports = {
    name: 'startgiveaway',
    aliases: ['sg', 'giveaway'],
    async execute(message, args) {
        if (!message.member.permissions.has('ModerateMembers')) {
            return message.reply('You need mod permissions to start a giveaway.')
        }

        const usage = 'Usage: `,startgiveaway <duration> <dm:yes/no> <#channel> <title...>`\nExample: `,startgiveaway 1h dm:yes #giveaways Free Nitro`'

        if (args.length < 4) return message.reply(usage)

        const duration = parseDuration(args[0])
        if (!duration) return message.reply('Invalid duration. Use format like `10m`, `2h`, `1d`.')

        const dmArg = args[1].toLowerCase()
        if (!['dm:yes', 'dm:no'].includes(dmArg)) return message.reply(usage)
        const dmWinner = dmArg === 'dm:yes'

        const channel = message.mentions.channels.first()
        if (!channel) return message.reply('Please mention a valid channel.')

        const title = args.slice(3).join(' ')
        const endsAt = new Date(Date.now() + duration)

        const [row] = await sql`
      INSERT INTO giveaways (guild_id, channel_id, title, ends_at, dm_winner, created_by)
      VALUES (${message.guild.id}, ${channel.id}, ${title}, ${endsAt}, ${dmWinner}, ${message.author.id})
      RETURNING id
    `

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway_enter_${row.id}`)
                .setLabel('🎉 Enter')
                .setStyle(ButtonStyle.Primary)
        )

        const embed = {
            color: 0x5865f2,
            title: `🎉 ${title}`,
            description: `Click the button below to enter!\n\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
            footer: { text: `Giveaway ID: ${row.id} • Started by ${message.author.tag}` }
        }

        const msg = await channel.send({ embeds: [embed], components: [button] })

        await sql`UPDATE giveaways SET message_id = ${msg.id} WHERE id = ${row.id}`

        message.reply(`Giveaway **${title}** started! Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>.`)
    }
}