const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    PermissionFlagsBits,
} = require('discord.js');
const { deleteConfig, updateConfig } = require('../../starboardHandler');

module.exports = {
    name: 'starboard',
    aliases: ['sb', 'starboardchannel'],

    async execute(message, args) {
        if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('You need the `Manage Server` permission to configure the starboard.');
        }

        if (args[0]?.toLowerCase() === 'off') {
            const confirmId = `starboard-off:${message.guild.id}:${message.author.id}`;
            const confirmationMessage = await message.reply({
                content: 'This will delete this server\'s saved starboard configuration. Already-posted starboard messages will stay. Continue?',
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(confirmId)
                            .setLabel('Confirm')
                            .setStyle(ButtonStyle.Danger)
                    ),
                ],
            });

            try {
                const confirmation = await confirmationMessage.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 30_000,
                    filter: (interaction) =>
                        interaction.customId === confirmId && interaction.user.id === message.author.id,
                });

                await deleteConfig(message.guild.id);
                return confirmation.update({
                    content: 'Starboard has been turned off and its saved configuration was deleted.',
                    components: [],
                });
            } catch {
                return confirmationMessage.edit({
                    content: 'Starboard shutdown cancelled.',
                    components: [],
                }).catch(() => null);
            }
        }

        const channel = message.mentions.channels.first();
        if (!channel || !channel.isTextBased?.() || channel.isDMBased?.()) {
            return message.reply("Mention a server text channel. Example: `,starboard #starboard`.\nAfter that, use `,starboardthreshold <number>` to set the starboard minimum amount before a message gets featured, and `,starboardself <yes:no>` to allow self-starring.\n-# To disable starboard, run `,starboard off`. Keep in mind that this **will delete your server's starboard config.");
        }

        await updateConfig(message.guild.id, (config) => {
            config.channelId = channel.id;
        });

        return message.reply(`Starboard channel set to ${channel}.`);
    },
};
