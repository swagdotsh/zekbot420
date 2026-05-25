## Why is the download feature optional?
Due to copyright, piracy, and other reasons, the feature has been moved to the optional folder. It is not tracked in `index.js`, meaning that unless moved to `commands/` or `slashCommands/`, it will not be loaded by the bot. This is to prevent any issues that may arise from the feature being included in the bot's commands folder by default.

The main instance of zekbot420 does **not** have the download feature loaded, hence why running your own instance is required for this feature (as stated [on the bot's commands page on the website](https://zekbot420.swagrelated.com/commands/#utility)).

## How do I enable it?
Inside the folder is two folders: `downloadsPrefix/`  and `downloadsSlash/`. 

1. Move `downloadsPrefix/` to `commands/`
2. `downloadsSlash/` to `slashCommands/`
3. Deploy slash commands with `node deploy-commands global` (if your bot is in multiple servers) or `node deploy-commands` (if your bot is in one server)
4. Restart the bot. The download commands will now work.