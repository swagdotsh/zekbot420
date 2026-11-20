const { voiceChannelBlocker } = require('../../musicPlayer');

module.exports = {
  name: 'pause',
  aliases: ['resume'],
  async execute(message) {
    const session = message.client.voiceSessions?.get(message.guild.id);
    if (!session) return message.reply('Nothing is playing right now. <:smirk2:1498272372539785286>');
    const blocked = voiceChannelBlocker(message.member, session);
    if (blocked) return message.reply(blocked);

    const wasPaused = session.player.state.status === 'paused';
    if (wasPaused) {
      session.player.unpause();
      return message.reply('▶️ Resumed.');
    }

    const paused = session.player.pause();
    if (!paused) return message.reply('Could not pause playback. <:smirk2:1498272372539785286>');
    return message.reply('⏸ Paused. \n\-# Tip: To unpause, run `' + process.env.PREFIX + 'pause` again.');
  }
};