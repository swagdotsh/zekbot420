const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType,
    ChannelType,
    MessageFlags
} = require('discord.js');
const {
    startTts,
    leaveTts,
    skipTts,
    setTtsChannel,
    getUserVoice,
    setUserVoice,
    getVoiceList,
    findVoice,
    formatVoiceList
} = require('../../ttsHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Text-to-speech in voice channels')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .addSubcommand((sub) =>
            sub.setName('join').setDescription('Join your VC and read out messages')
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Stop TTS and leave the VC')
        )
        .addSubcommand((sub) =>
            sub
                .setName('channel')
                .setDescription('Set or remove the extra channel TTS reads from (VC chats always work)')
                .addBooleanOption((opt) =>
                    opt
                        .setName('enabled')
                        .setDescription('Turn the TTS channel on or off')
                        .setRequired(true)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to read from (defaults to this one)')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Skip the message being read out')
        )
        .addSubcommand((sub) =>
            sub
                .setName('voicelist')
                .setDescription('List available TTS voices')
                .addStringOption((opt) =>
                    opt
                        .setName('locale')
                        .setDescription('Language/region to list, like en-US, en-GB or ja (defaults to en-US)')
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('voice')
                .setDescription('See or change your TTS voice')
                .addStringOption((opt) =>
                    opt
                        .setName('name')
                        .setDescription('Voice name, or "default"')
                        .setAutocomplete(true)
                )
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const voices = await getVoiceList();

        const matches = voices
            .filter((v) => v.ShortName.toLowerCase().includes(focused || 'en-us'))
            .slice(0, 25)
            .map((v) => ({ name: `${v.ShortName} (${v.Gender})`, value: v.ShortName }));

        return interaction.respond(matches);
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'join') {
                await interaction.deferReply();
                return interaction.editReply(await startTts(interaction, interaction.member));
            }

            if (sub === 'leave') {
                if (!leaveTts(interaction.client, interaction.guild.id)) {
                    return interaction.reply({ content: "TTS isn't running right now. <:smirk2:1498272372539785286>", flags: MessageFlags.Ephemeral });
                }
                return interaction.reply('👋 Stopped TTS and left the voice channel.');
            }

            if (sub === 'skip') {
                if (!skipTts(interaction.client, interaction.guild.id)) {
                    return interaction.reply({ content: "TTS isn't running right now. <:smirk2:1498272372539785286>", flags: MessageFlags.Ephemeral });
                }
                return interaction.reply({ content: '⏭️ Skipped.', flags: MessageFlags.Ephemeral });
            }

            if (sub === 'channel') {
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: 'You need **Manage Server** to set the TTS channel. <:smirk2:1498272372539785286>', flags: MessageFlags.Ephemeral });
                }

                if (!interaction.options.getBoolean('enabled')) {
                    await setTtsChannel(interaction.guild.id, null);
                    return interaction.reply({ content: 'Removed the TTS channel. Only VC chats will be read now.', flags: MessageFlags.Ephemeral });
                }

                const channel = interaction.options.getChannel('channel') || interaction.channel;
                if (!channel?.isTextBased()) {
                    return interaction.reply({ content: "That's not a valid text channel. <:smirk2:1498272372539785286>", flags: MessageFlags.Ephemeral });
                }

                await setTtsChannel(interaction.guild.id, channel.id);
                return interaction.reply({ content: `TTS channel set to <#${channel.id}>. VC chats still work too.`, flags: MessageFlags.Ephemeral });
            }

            if (sub === 'voicelist') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                return interaction.editReply(await formatVoiceList(interaction.options.getString('locale') || undefined));
            }

            if (sub === 'voice') {
                const name = interaction.options.getString('name');

                if (!name) {
                    const voice = await getUserVoice(interaction.user.id);
                    return interaction.reply({ content: `Your TTS voice: **${voice}**`, flags: MessageFlags.Ephemeral });
                }

                const voice = await findVoice(name);
                if (!voice) {
                    return interaction.reply({ content: `No voice called **${name}**. Use \`/tts voicelist\` to see them.`, flags: MessageFlags.Ephemeral });
                }

                await setUserVoice(interaction.user.id, voice);
                return interaction.reply({ content: `Your TTS voice is now **${voice}**.`, flags: MessageFlags.Ephemeral });
            }
        } catch (err) {
            console.error(`/tts ${sub} failed:`, err);

            const payload = { content: 'Something went wrong with TTS. <:smirk2:1498272372539785286>', flags: MessageFlags.Ephemeral };
            if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
            return interaction.reply(payload);
        }
    }
};
