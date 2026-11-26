const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { Akinator, AkinatorAnswer } = require('@aqul/akinator-api');
const { fail, loading } = require('../../ui');

const IDLE_MS = 2 * 60 * 1000;
const MAX_QUESTIONS = 80;
const COLOR = 0xf5a623;
const ICON = 'https://en.akinator.com/assets/img/akitudes_670x1096/defi.png';

const ANSWERS = [
    ['yes', 'Yes', AkinatorAnswer.Yes, ButtonStyle.Success],
    ['no', 'No', AkinatorAnswer.No, ButtonStyle.Danger],
    ['idk', 'Don\'t know', AkinatorAnswer["Don't know"], ButtonStyle.Secondary],
    ['probably', 'Probably', AkinatorAnswer.Probably, ButtonStyle.Primary],
    ['probablynot', 'Probably not', AkinatorAnswer['Probably not'], ButtonStyle.Primary],
];

const activeGames = new Set();

function questionRows(id, { disabled = false, canGoBack = false } = {}) {
    const answers = new ActionRowBuilder().addComponents(
        ANSWERS.map(([key, text, , style]) =>
            new ButtonBuilder().setCustomId(`aki:${id}:${key}`).setLabel(text).setStyle(style).setDisabled(disabled)),
    );
    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aki:${id}:back`).setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || !canGoBack),
        new ButtonBuilder().setCustomId(`aki:${id}:stop`).setLabel('Stop').setEmoji('🛑').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    );
    return [answers, controls];
}

function questionEmbed(user, api, number) {
    const progress = Math.max(0, Math.min(100, Math.round(api.progress)));
    const filled = Math.round(progress / 10);
    return new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: `${user.displayName}'s game`, iconURL: user.displayAvatarURL() })
        .setTitle(`Question ${number}`)
        .setDescription(`**${api.question}**`)
        .setThumbnail(ICON)
        .setFooter({ text: `Confidence ${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${progress}%` });
}

function guessEmbed(user, api, number) {
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: `${user.displayName}'s game`, iconURL: user.displayAvatarURL() })
        .setTitle(`I think it's ${api.sugestion_name}!`)
        .setDescription([api.sugestion_desc, `-# Guessed after ${number} question${number === 1 ? '' : 's'}.`].filter(Boolean).join('\n'));
    if (/^https?:\/\//.test(api.sugestion_photo ?? '')) embed.setImage(api.sugestion_photo);
    return embed;
}

const guessRow = (id) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`aki:${id}:right`).setLabel('Yes, that\'s right').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`aki:${id}:wrong`).setLabel('No').setStyle(ButtonStyle.Danger),
);

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('akinator')
        .setDescription('Think of a character and Akinator will guess who it is')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addBooleanOption((opt) => opt.setName('child_mode').setDescription('Leave out adult characters (default: on)')),

    async execute(interaction) {
        const user = interaction.user;
        if (activeGames.has(user.id)) {
            return interaction.reply({ content: fail('You already have an Akinator game going. Finish or stop that one first.'), flags: MessageFlags.Ephemeral });
        }

        activeGames.add(user.id);
        try {
            await interaction.reply({ content: loading('Akinator is getting ready...') });

            const api = new Akinator({ region: 'en', childMode: interaction.options.getBoolean('child_mode') ?? true });
            try {
                await api.start();
            } catch (error) {
                console.error('[akinator] failed to start:', error.message);
                return interaction.editReply({ content: fail('Akinator isn\'t answering right now. Try again later.') });
            }

            const id = interaction.id;
            let number = 1;
            const message = await interaction.editReply({ content: '', embeds: [questionEmbed(user, api, number)], components: questionRows(id) });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                idle: IDLE_MS,
                filter: (i) => i.customId.startsWith(`aki:${id}:`),
            });

            await new Promise((resolve) => {
                collector.on('collect', async (i) => {
                    if (i.user.id !== user.id) {
                        return i.reply({ content: fail('This isn\'t your game. Start your own with `/game akinator`.'), flags: MessageFlags.Ephemeral });
                    }
                    const action = i.customId.split(':')[2];

                    if (action === 'stop') {
                        collector.stop('stopped');
                        return i.update({ embeds: [questionEmbed(user, api, number).setTitle('Game stopped')], components: [] });
                    }
                    if (action === 'right' || action === 'wrong') {
                        collector.stop('finished');
                        const embed = EmbedBuilder.from(i.message.embeds[0]).setFooter({
                            text: action === 'right' ? 'Great! I guessed right once again. 🧞' : 'You beat me! Play again with /akinator.',
                        });
                        return i.update({ embeds: [embed], components: [] });
                    }

                    await i.update({ components: questionRows(id, { disabled: true }) });
                    try {
                        if (action === 'back') {
                            await api.cancelAnswer();
                            number = Math.max(1, number - 1);
                        } else {
                            const answer = ANSWERS.find(([key]) => key === action);
                            if (!answer) return;
                            await api.answer(answer[2]);
                            number++;
                        }
                    } catch (error) {
                        console.error('[akinator] request failed:', error.message);
                        collector.stop('error');
                        return interaction.editReply({ content: fail('Akinator stopped answering. Start a new game with `/game akinator`.'), components: [] }).catch(() => {});
                    }

                    if (api.isWin) {
                        return interaction.editReply({ embeds: [guessEmbed(user, api, number)], components: [guessRow(id)] }).catch(() => {});
                    }
                    if (number > MAX_QUESTIONS) {
                        collector.stop('finished');
                        return interaction.editReply({ embeds: [questionEmbed(user, api, number).setTitle('You stumped me! 🏳️')], components: [] }).catch(() => {});
                    }
                    return interaction.editReply({ embeds: [questionEmbed(user, api, number)], components: questionRows(id, { canGoBack: number > 1 }) }).catch(() => {});
                });

                collector.on('end', async (_, reason) => {
                    if (reason === 'idle') {
                        await interaction.editReply({ content: '⏱️ The game ended because nobody answered for 2 minutes.', components: [] }).catch(() => {});
                    }
                    resolve();
                });
            });
        } finally {
            activeGames.delete(user.id);
        }
    },
};
