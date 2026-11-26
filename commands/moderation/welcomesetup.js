const { currentPrefix } = require('../../prefix');
const { updateWelcomeConfig } = require('../../welcomeStore');
const { ok, fail } = require('../../ui');

module.exports = {
  name: 'welcomesetup',
  aliases: ['ws'],
  async execute(message) {
    if (!message.member.permissions.has('ManageGuild')) return message.reply(fail('You need the `Manage Server` permission to use this.'));

    const channel = message.mentions.channels.find(c => c.guildId === message.guild.id);
    if (!channel) return message.reply(`Usage: \`${currentPrefix()}welcomesetup #channel\``);

    try {
      await updateWelcomeConfig(message.guild.id, (config) => {
        config.channelId = channel.id;
      });
      message.reply(ok(`Welcome messages will be sent in ${channel}. Customize them with \`/welcome edit\`.`));
    } catch (err) {
      console.error('[welcomesetup]', err);
      message.reply(fail('Failed to save the welcome settings. Try again in a moment.'));
    }
  }
};
