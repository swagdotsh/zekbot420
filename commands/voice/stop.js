const fs = require('fs');

module.exports = {
    name: 'stop',
    async execute(message) {
        const session = message.client.voiceSessions?.get(message.guild.id);
        if (!session) return message.reply('Nothing is playing right now. <:smirk:1498272372539785286>');

        try {
      if (session.inactivityTimeout) {
        clearTimeout(session.inactivityTimeout);
        session.inactivityTimeout = null;
      }

      if (session.current?.filePath && fs.existsSync(session.current.filePath)) {
        fs.unlinkSync(session.current.filePath);
      }

      for (const item of session.queue || []) {
        if (item?.filePath && fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
      }

      session.queue = [];
      session.current = null;

      try {
        if (session.player) {
          session.player.removeAllListeners('error');
          session.player.on('error', () => {});
          session.player.stop();
        }
      } catch (e) {
        console.error('player stop error:', e);
      }

      try {
        if (session.connection && session.connection.state?.status !== 'destroyed') {
          session.connection.destroy();
        }
      } catch (e) {
        console.error('connection destroy error:', e);
      }

      message.client.voiceSessions.delete(message.guild.id);
      return message.reply('Stopped playback and cleared queue.');
    } catch (err) {
      console.error('stop command error:', err);
      return message.reply('Failed to stop playback. <:smirk:1498272372539785286>');
    }
  }
};