const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

function buildControls(guildId, paused = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`music:back:${guildId}`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`music:pause:${guildId}`)
                .setEmoji(paused ? '▶️' : '⏸️')
                .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music:skip:${guildId}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music:queue:${guildId}`).setEmoji('📜').setLabel('Queue').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`music:stop:${guildId}`).setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        ),
    ];
}

async function handleMusicButton(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('music:')) return false;

    const music = require('./musicPlayer');
    const { buildQueueEmbed } = require('./commands/voice/queue');

    const [, action, guildId] = interaction.customId.split(':');
    const session = interaction.client.voiceSessions?.get(guildId);

    if (!session || session.mode === 'tts' || guildId !== interaction.guildId) {
        await interaction.update({ components: [] }).catch(() => {});
        return true;
    }

    if (action === 'queue') {
        await interaction.reply({ embeds: [buildQueueEmbed(session)], flags: MessageFlags.Ephemeral });
        return true;
    }

    if (interaction.member?.voice?.channelId !== session.connection.joinConfig.channelId) {
        await interaction.reply({ content: 'Join my voice channel to use these. <:smirk2:1498272372539785286>', flags: MessageFlags.Ephemeral });
        return true;
    }

    const who = interaction.member.displayName;

    if (action === 'pause') {
        const paused = music.togglePause(session);
        if (paused === null) {
            await interaction.reply({ content: 'Nothing is playing right now.', flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.update({ components: buildControls(guildId, paused) });
        return true;
    }

    if (action === 'skip') {
        if (!session.current) {
            await interaction.reply({ content: 'Nothing is playing to skip.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const skippedName = music.trackLabel(session.current);
        music.skipCurrent(session);
        await interaction.reply({ content: `⏭️ **${who}** skipped **${skippedName}**.`, allowedMentions: { parse: [] } });
        return true;
    }

    if (action === 'back') {
        const previous = await music.goBack(interaction.client, guildId);
        if (!previous) {
            await interaction.reply({ content: "There's nothing before this track.", flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.reply({ content: `⏮️ **${who}** went back to **${music.trackLabel(previous)}**.`, allowedMentions: { parse: [] } });
        return true;
    }

    if (action === 'stop') {
        music.stopSession(interaction.client, guildId);
        await interaction.update({ components: [] }).catch(() => {});
        await interaction.followUp({ content: `⏹️ **${who}** stopped playback and cleared the queue.`, allowedMentions: { parse: [] } });
        return true;
    }

    return false;
}

module.exports = { buildControls, handleMusicButton };
