const {
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');
const { ok, fail } = require('../../ui');
const { parseReactionEmoji, updateConfig } = require('../../starboardHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staremoji')
        .setDescription('Set the emoji that counts toward the starboard')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(0)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((option) =>
            option
                .setName('emoji')
                .setDescription('A standard emoji or custom emoji such as <:star:123>')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'You need the `Manage Server` permission to configure the starboard. <:smirk2:1498272372539785286>',
                flags: MessageFlags.Ephemeral,
            });
        }

        const emoji = parseReactionEmoji(interaction.options.getString('emoji', true));
        if (!emoji) {
            return interaction.reply({
                content: fail('Provide one standard or custom emoji, such as `⭐` or `<:star:123456789012345678>`.'),
                flags: MessageFlags.Ephemeral,
            });
        }

        await updateConfig(interaction.guild.id, (config) => {
            config.reactionEmoji = emoji;
        });

        const display = emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
        return interaction.reply({
            content: ok(`Starboard reactions are now counted with ${display}.`),
            flags: MessageFlags.Ephemeral,
        });
    },
};
