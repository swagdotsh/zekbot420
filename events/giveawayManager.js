const { neon } = require('@neondatabase/serverless')
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

const sql = neon(process.env.NEON_DATABASE_URL)

async function checkExpiredGiveaways(client) {
    const expired = await sql`
    SELECT * FROM giveaways
    WHERE ended = FALSE AND ends_at <= NOW()
  `

    for (const giveaway of expired) {
        const entries = await sql`SELECT user_id FROM giveaway_entries WHERE giveaway_id = ${giveaway.id}`

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway_enter_${giveaway.id}`)
                .setLabel('🎉 Enter')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        )

        const guild = client.guilds.cache.get(giveaway.guild_id)
        if (!guild) continue

        const channel = guild.channels.cache.get(giveaway.channel_id)

        if (entries.length === 0) {
            await sql`UPDATE giveaways SET ended = TRUE WHERE id = ${giveaway.id}`

            if (channel && giveaway.message_id) {
                const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null)
                if (msg) await msg.edit({ components: [disabledRow] }).catch(() => null)
                await channel.send(`The **${giveaway.title}** giveaway ended with no entries.`)
            }
            continue
        }

        const winner = entries[Math.floor(Math.random() * entries.length)]

        await sql`UPDATE giveaways SET ended = TRUE, winner_id = ${winner.user_id} WHERE id = ${giveaway.id}`

        if (channel && giveaway.message_id) {
            const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null)
            if (msg) await msg.edit({ components: [disabledRow] }).catch(() => null)

            await channel.send({
                content: `🎉 <@${winner.user_id}> won the **${giveaway.title}** giveaway! Congratulations!`
            })
        }

        if (giveaway.dm_winner) {
            const user = await client.users.fetch(winner.user_id).catch(() => null)
            if (user) {
                user.send(`🎉 You won the **${giveaway.title}** giveaway in **${guild.name}**! Congratulations!`).catch(() => null)
            }
        }
    }
}

module.exports = {
    name: 'ready',
    once: false,
    async execute(client) {
        let expiryCheckRunning = false

        const runExpiryCheck = async () => {
            if (expiryCheckRunning) return
            expiryCheckRunning = true

            try {
                await checkExpiredGiveaways(client)
            } catch (error) {
                console.error('Giveaway expiry check failed:', error)
            } finally {
                expiryCheckRunning = false
            }
        }

        setInterval(() => runExpiryCheck().catch(console.error), 15000)
        runExpiryCheck().catch(console.error)

        client.on('interactionCreate', async (interaction) => {
            console.log('[Giveaway] interactionCreate fired')
            try {
                if (!interaction.isButton()) return console.log('[Giveaway] Not a button interaction')

                console.log('[Giveaway] Button ID:', interaction.customId)

                if (!interaction.customId.startsWith('giveaway_enter_')) {
                    return console.log('[Giveaway] Button is not a giveaway button')
                }

                console.log('[Giveaway] Deferring interaction')
                await interaction.deferUpdate()

                const giveawayId = parseInt(interaction.customId.replace('giveaway_enter_', ''))

                const [giveaway] = await sql`SELECT * FROM giveaways WHERE id = ${giveawayId}`
                console.log('[Giveaway] Giveaway lookup result:', giveaway)

                if (!giveaway || giveaway.ended) {
                    return interaction.followUp({
                        content: 'This giveaway has already ended.',
                        ephemeral: true
                    })
                }

                try {
                    console.log('[Giveaway] Attempting database insert')
                    await sql`
              INSERT INTO giveaway_entries (giveaway_id, user_id)
              VALUES (${giveawayId}, ${interaction.user.id})
            `

                    return interaction.followUp({
                        content: '🎉 You\'ve entered the giveaway! Good luck!',
                        ephemeral: true
                    })
                } catch (err) {
                    if (err.message?.includes('unique')) {
                        return interaction.followUp({
                            content: 'You\'ve already entered this giveaway.',
                            ephemeral: true
                        })
                    }

                    console.error('Giveaway entry error:', err)

                    return interaction.followUp({
                        content: 'Something went wrong. Try again.',
                        ephemeral: true
                    })
                }
            } catch (err) {
                console.error('Interaction handler error:', err)
            }
        })
    }
}
