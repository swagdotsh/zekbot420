module.exports = {
    name: 'help',
    execute(message, args) {
      message.reply({
        content: `# Hi ${message.author}!\n\All commands are available on the [bot's website](https://zekbot420.swagrelated.com/commands/).\n\If you have any problems, visit the **[Issues tab](https://github.com/justadonisstar/zekbot420/issues)** to report or see if it already is.`,
        allowedMentions: { repliedUser: false }
      });
    }
  };
  