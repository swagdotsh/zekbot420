const fs = require('fs/promises');
const path = require('path');
const {
    ActionRowBuilder,
    AutoModerationActionType,
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
    InteractionContextType,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const automodProfile = require('./_automodProfile');
const automodSpam = require('./_automodSpam');

const RULE_NAME = 'zekbot420 AutoMod Keywords';
const LEGACY_TIMEOUT_RULE_NAME = 'zekbot420 AutoMod Keyword Timeout';
const MODAL_ID = 'zekbot-automod-words';
const WORDS_INPUT_ID = 'words';
const TIMEOUT_INPUT_ID = 'timeout-minutes';
const ALERT_MODS_INPUT_ID = 'alert-mods';
const MAX_KEYWORDS = 1000;
const MAX_KEYWORD_LENGTH = 60;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

function modlogPath(guildId) {
    return path.resolve(process.cwd(), 'data', String(guildId), 'modlog.json');
}

async function getModlogChannelId(guildId) {
    try {
        const content = await fs.readFile(modlogPath(guildId), 'utf8');
        return JSON.parse(content)?.channelId ?? null;
    } catch {
        return null;
    }
}

/**
 * Accepts comma-separated words and quoted phrases, for example:
 * spam, "bad phrase", scam
 */
function parseKeywords(input) {
    const keywords = [];
    const matcher = /"([^"\r\n]*)"|([^,"]+)/g;
    let match;

    while ((match = matcher.exec(input)) !== null) {
        const keyword = (match[1] ?? match[2]).trim();
        if (keyword) keywords.push(keyword);
    }

    return [...new Set(keywords)];
}

function getKeywordValidationError(keywords) {
    if (!keywords.length) return 'Enter at least one word or phrase.';
    if (keywords.length > MAX_KEYWORDS) {
        return `Discord AutoMod supports up to ${MAX_KEYWORDS} keywords in one rule.`;
    }

    const tooLong = keywords.find((keyword) => keyword.length > MAX_KEYWORD_LENGTH);
    if (tooLong) {
        return `Each AutoMod word or phrase must be ${MAX_KEYWORD_LENGTH} characters or fewer. Invalid entry: \`${tooLong}\``;
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Manage this server\'s Discord AutoMod rules')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('words')
                .setDescription('Set words, timeouts, and mod alerts for AutoMod')
        )
        .addSubcommand(automodProfile.addSubcommand)
        .addSubcommand(automodSpam.addSubcommand),

    async execute(interaction) {
        if (!interaction.guild) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Only server administrators can configure AutoMod words.',
                ephemeral: true,
            });
        }

        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'I need the `Manage Server` permission to update Discord AutoMod rules.',
                ephemeral: true,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'profile') return automodProfile.execute(interaction);
        if (subcommand === 'spam') return automodSpam.execute(interaction);

        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: 'I need the `Timeout Members` permission to create this AutoMod rule.',
                ephemeral: true,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(MODAL_ID)
            .setTitle('Set AutoMod words');

        const wordsInput = new TextInputBuilder()
            .setCustomId(WORDS_INPUT_ID)
            .setLabel('Words or phrases to block')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('oneword, anotherword, "or a full phrase works too"')
            .setRequired(true)
            .setMaxLength(4000);

        const timeoutInput = new TextInputBuilder()
            .setCustomId(TIMEOUT_INPUT_ID)
            .setLabel('Timeout length in minutes (1–40,320)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('60')
            .setRequired(true)
            .setMaxLength(5);

        const alertModsInput = new TextInputBuilder()
            .setCustomId(ALERT_MODS_INPUT_ID)
            .setLabel('Alert mods in the modlog channel? (yes/no)')
            .setStyle(TextInputStyle.Short)
            .setValue('no')
            .setRequired(true)
            .setMaxLength(3);

        modal.addComponents(
            new ActionRowBuilder().addComponents(wordsInput),
            new ActionRowBuilder().addComponents(timeoutInput),
            new ActionRowBuilder().addComponents(alertModsInput)
        );
        await interaction.showModal(modal);

        let submission;
        try {
            submission = await interaction.awaitModalSubmit({
                time: 5 * 60 * 1000,
                filter: (modalInteraction) =>
                    modalInteraction.customId === MODAL_ID &&
                    modalInteraction.user.id === interaction.user.id,
            });
        } catch {
            return;
        }

        const keywords = parseKeywords(submission.fields.getTextInputValue(WORDS_INPUT_ID));
        const keywordError = getKeywordValidationError(keywords);
        if (keywordError) return submission.reply({ content: keywordError, ephemeral: true });

        const timeoutMinutes = Number(submission.fields.getTextInputValue(TIMEOUT_INPUT_ID).trim());
        if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > MAX_TIMEOUT_MINUTES) {
            return submission.reply({
                content: `Enter a whole number of minutes from 1 to ${MAX_TIMEOUT_MINUTES.toLocaleString()}.`,
                ephemeral: true,
            });
        }

        const alertModsAnswer = submission.fields.getTextInputValue(ALERT_MODS_INPUT_ID).trim().toLowerCase();
        if (!['yes', 'no'].includes(alertModsAnswer)) {
            return submission.reply({
                content: 'For mod alerts, enter exactly `yes` or `no`.',
                ephemeral: true,
            });
        }

        let modlogChannel = null;
        if (alertModsAnswer === 'yes') {
            const modlogChannelId = await getModlogChannelId(interaction.guild.id);
            modlogChannel = modlogChannelId
                ? await interaction.guild.channels.fetch(modlogChannelId).catch(() => null)
                : null;

            if (!modlogChannel?.isTextBased?.() || modlogChannel.isDMBased?.()) {
                return submission.reply({
                    content: 'Mod alerts need a valid modlog channel. Set one first with `,modlog #channel`, then run this command again.',
                    ephemeral: true,
                });
            }
        }

        await submission.deferReply({ ephemeral: true });

        try {
            const rules = await interaction.guild.autoModerationRules.fetch();
            const existingRule = rules.find((rule) => rule.name === RULE_NAME);
            const legacyTimeoutRule = rules.find((rule) => rule.name === LEGACY_TIMEOUT_RULE_NAME);
            const reason = `AutoMod keywords updated by ${interaction.user.tag}`;
            const actions = [
                {
                    type: AutoModerationActionType.BlockMessage,
                    metadata: {
                        customMessage: 'Your message contains a word or phrase blocked by this server.',
                    },
                },
                {
                    type: AutoModerationActionType.Timeout,
                    metadata: { durationSeconds: timeoutMinutes * 60 },
                },
            ];

            if (modlogChannel) {
                actions.push({
                    type: AutoModerationActionType.SendAlertMessage,
                    metadata: { channel: modlogChannel },
                });
            }

            const ruleOptions = {
                eventType: AutoModerationRuleEventType.MessageSend,
                triggerMetadata: { keywordFilter: keywords },
                actions,
                enabled: true,
                reason,
            };

            if (existingRule) {
                await existingRule.edit(ruleOptions);
            } else {
                await interaction.guild.autoModerationRules.create({
                    name: RULE_NAME,
                    triggerType: AutoModerationRuleTriggerType.Keyword,
                    ...ruleOptions,
                });
            }

            // The earlier /automod words_timeout command used this separate bot-owned rule.
            // Remove it now that /automod words manages all AutoMod actions in one rule.
            if (legacyTimeoutRule) await legacyTimeoutRule.delete(reason);

            const alertMessage = modlogChannel
                ? ` Alerts will be sent to ${modlogChannel}.`
                : ' Mod alerts are disabled.';

            return submission.editReply(
                `AutoMod will block matching messages and timeout members for ${timeoutMinutes} minute${timeoutMinutes === 1 ? '' : 's'} (${keywords.length} word${keywords.length === 1 ? '' : 's'} or phrase${keywords.length === 1 ? '' : 's'}).${alertMessage}`
            );
        } catch (error) {
            console.error('Failed to update AutoMod keyword rule:', error);
            return submission.editReply(
                'I could not update the AutoMod rule. Confirm that I have `Manage Server` and `Timeout Members` permissions.'
            );
        }
    },

    // Exported for lightweight unit testing without Discord interactions.
    parseKeywords,
};
