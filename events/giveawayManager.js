const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js')

const { sql } = require('../db');
const { createDueScheduler } = require('../dueScheduler');

async function initGiveawayDB() {
    await sql`
        CREATE TABLE IF NOT EXISTS giveaways (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            title TEXT NOT NULL,
            ends_at TIMESTAMPTZ NOT NULL,
            dm_winner BOOLEAN DEFAULT FALSE,
            created_by TEXT,
            ended BOOLEAN DEFAULT FALSE,
            winner_id TEXT
        )
    `
    await sql`
        CREATE TABLE IF NOT EXISTS giveaway_entries (
            giveaway_id INT NOT NULL,
            user_id TEXT NOT NULL
        )
    `
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS giveaway_entries_unique ON giveaway_entries (giveaway_id, user_id)`
        .catch((error) => console.warn('Could not add giveaway entry unique index:', error.message))
}

async function pickWinner(guild, entries) {
    const pool = [...entries];
    while (pool.length) {
        const [entry] = pool.splice(Math.floor(Math.random() * pool.length), 1);
        const member = await guild.members.fetch(entry.user_id).catch(() => null);
        if (member) return entry;
    }
    return null;
}

async function endGiveaway(client, giveaway) {
    const guild = client.guilds.cache.get(giveaway.guild_id)
    if (!guild) return false

    const entries = await sql`SELECT user_id FROM giveaway_entries WHERE giveaway_id = ${giveaway.id}`
    const winner = entries.length ? await pickWinner(guild, entries) : null

    const claimed = await sql`
        UPDATE giveaways SET ended = TRUE, winner_id = ${winner?.user_id ?? null}
        WHERE id = ${giveaway.id} AND ended = FALSE
        RETURNING id
    `
    if (!claimed.length) return

    const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveaway_enter_${giveaway.id}`)
            .setLabel('🎉 Enter')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
    )

    const channel = guild.channels.cache.get(giveaway.channel_id)
    if (channel && giveaway.message_id) {
        const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null)
        if (msg) await msg.edit({ components: [disabledRow] }).catch(() => null)
    }

    if (!winner) {
        const why = entries.length ? 'none of the entrants are still in the server' : 'there were no entries'
        await channel?.send({ content: `The **${giveaway.title}** giveaway ended, but ${why}.`, allowedMentions: { parse: [] } }).catch(() => null)
        return
    }

    await channel?.send({
        content: `🎉 <@${winner.user_id}> won the **${giveaway.title}** giveaway! Congratulations!`,
        allowedMentions: { users: [winner.user_id] },
    }).catch(() => null)

    if (giveaway.dm_winner) {
        const user = await client.users.fetch(winner.user_id).catch(() => null)
        await user?.send(`🎉 You won the **${giveaway.title}** giveaway in **${guild.name}**! Congratulations!`).catch(() => null)
    }
}

async function checkExpiredGiveaways(client) {
    const expired = await sql`
    SELECT * FROM giveaways
    WHERE ended = FALSE AND ends_at <= NOW()
  `

    let hadFailures = false
    for (const giveaway of expired) {
        const ended = await endGiveaway(client, giveaway).catch((error) => {
            console.error(`Failed to end giveaway ${giveaway.id}:`, error)
            return false
        })
        if (ended === false) hadFailures = true
    }
    return hadFailures
}

async function getNextGiveawayEnd() {
    const [row] = await sql`SELECT MIN(ends_at) AS next FROM giveaways WHERE ended = FALSE AND ends_at > NOW()`
    return row?.next ? new Date(row.next).getTime() : null
}

module.exports = {
    endGiveaway,
    initGiveawayDB,
    name: 'ready',
    once: false,
    async execute(client) {
        createDueScheduler('giveaways', {
            runDue: () => checkExpiredGiveaways(client),
            getNextDue: getNextGiveawayEnd,
        }).start()

        client.on('interactionCreate', async (interaction) => {
            try {
                if (!interaction.isButton() || !interaction.customId.startsWith('giveaway_enter_')) return

                await interaction.deferUpdate()

                const giveawayId = parseInt(interaction.customId.replace('giveaway_enter_', ''))

                const [giveaway] = await sql`SELECT * FROM giveaways WHERE id = ${giveawayId}`

                if (!giveaway || giveaway.ended) {
                    return interaction.followUp({
                        content: 'This giveaway has already ended.',
                        flags: MessageFlags.Ephemeral
                    })
                }

                const inserted = await sql`
                    INSERT INTO giveaway_entries (giveaway_id, user_id)
                    SELECT ${giveawayId}, ${interaction.user.id}
                    WHERE NOT EXISTS (
                        SELECT 1 FROM giveaway_entries WHERE giveaway_id = ${giveawayId} AND user_id = ${interaction.user.id}
                    )
                    ON CONFLICT DO NOTHING
                    RETURNING giveaway_id
                `.catch((err) => {
                    console.error('Giveaway entry error:', err)
                    return null
                })

                const content = inserted === null
                    ? 'Something went wrong. Try again.'
                    : inserted.length ? '🎉 You\'ve entered the giveaway! Good luck!' : 'You\'ve already entered this giveaway.'
                return interaction.followUp({ content, flags: MessageFlags.Ephemeral })
            } catch (err) {
                console.error('Interaction handler error:', err)
            }
        })
    }
}
