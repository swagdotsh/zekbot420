const {
    AutoModerationActionType,
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
} = require('discord.js');

const WORDS_RULE_NAME = 'zekbot420 AutoMod Keywords';
const PROFILE_RULE_NAME = 'zekbot420 AutoMod Profile Filter';

module.exports = {
    addSubcommand(builder) {
        return builder
            .setName('profile')
            .setDescription('Enable profile filtering using your AutoMod words');
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const rules = await interaction.guild.autoModerationRules.fetch();
            const wordsRule = rules.find((rule) => rule.name === WORDS_RULE_NAME);
            const existingProfileRule = rules.find((rule) => rule.name === PROFILE_RULE_NAME);
            const keywords = wordsRule?.triggerMetadata?.keywordFilter ?? [];

            if (!keywords.length) {
                return interaction.editReply(
                    'Set up your blocked words first with `/automod words`, then run `/automod profile`.'
                );
            }

            const ruleOptions = {
                eventType: AutoModerationRuleEventType.MemberUpdate,
                triggerMetadata: { keywordFilter: keywords },
                actions: [{ type: AutoModerationActionType.BlockMemberInteraction }],
                enabled: true,
                reason: `AutoMod profile filter enabled by ${interaction.user.tag}`,
            };

            if (existingProfileRule) {
                await existingProfileRule.edit(ruleOptions);
            } else {
                await interaction.guild.autoModerationRules.create({
                    name: PROFILE_RULE_NAME,
                    triggerType: AutoModerationRuleTriggerType.MemberProfile,
                    ...ruleOptions,
                });
            }

            return interaction.editReply(
                `Profile filtering is enabled with the ${keywords.length} word${keywords.length === 1 ? '' : 's'} or phrase${keywords.length === 1 ? '' : 's'} from /automod words.`
            );
        } catch (error) {
            console.error('Failed to enable AutoMod profile filter:', error);
            return interaction.editReply(
                'I could not enable the profile filter. Confirm that I have the `Manage Server` permission and that AutoMod is available in this server. <:smirk2:1498272372539785286>'
            );
        }
    },
};
