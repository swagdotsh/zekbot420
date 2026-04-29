module.exports = {
    name: 'uptime',
    execute(message, args) {
      const uptime = formatUptime(process.uptime());
      message.reply({
        content: "**zekbot420** has been up for `"+uptime+"`."
      });
    }
  };
  
  function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return ""+days+"d "+hours+"h "+minutes+"m "+secs+"s";
  }
  