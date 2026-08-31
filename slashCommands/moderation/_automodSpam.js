const {
    AutoModerationActionType,
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
} = require('discord.js');

const SPAM_RULE_NAME = 'zekbot420 AutoMod Spam';

module.exports = {
    addSubcommand(builder) {
        return builder
            .setName('spam')
            .setDescription('Enable or disable Discord\'s spam filter')
            .addStringOption((option) =>
                option
                    .setName('enable')
                    .setDescription('Whether the spam filter should be enabled')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Yes', value: 'yes' },
                        { name: 'No', value: 'no' }
                    )
            );
    },

    async execute(interaction) {
        const enabled = interaction.options.getString('enable', true) === 'yes';
        await interaction.deferReply({ ephemeral: true });

        try {
            const rules = await interaction.guild.autoModerationRules.fetch();
            const existingRule = rules.find((rule) => rule.name === SPAM_RULE_NAME);
            const ruleOptions = {
                eventType: AutoModerationRuleEventType.MessageSend,
                actions: [{
                    type: AutoModerationActionType.BlockMessage,
                    metadata: {
                        customMessage: 'Your message was blocked because it was detected as spam.',
                    },
                }],
                enabled,
                reason: `AutoMod spam filter ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`,
            };

            if (existingRule) {
                await existingRule.edit(ruleOptions);
            } else {
                await interaction.guild.autoModerationRules.create({
                    name: SPAM_RULE_NAME,
                    triggerType: AutoModerationRuleTriggerType.Spam,
                    ...ruleOptions,
                });
            }

            return interaction.editReply(
                `Discord's built-in spam filter is now ${enabled ? 'enabled' : 'disabled'}.`
            );
        } catch (error) {
            console.error('Failed to update AutoMod spam filter:', error);
            return interaction.editReply(
                'I could not update the spam filter. Confirm that I have the `Manage Server` permission and that AutoMod is available in this server.'
            );
        }
    },
};
