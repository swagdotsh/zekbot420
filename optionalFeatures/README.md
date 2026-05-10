## Why is the download feature optional?
Due to copyright, piracy, and other reasons, the feature has been moved to the optional folder. It is not tracked in index.js, meaning that unless moved to commands/ or slashCommands/, it will not be loaded by the bot. This is to prevent any legal issues that may arise from the feature being included in the main codebase.

The main instance of zekbot420 does **not** include the download feature, hence why running your own instance is required for this feature.

## How do I enable it?
Inside the folder is downloadsPrefix/ and downloadsSlash/. Move downloadsPrefix/ to commands/ & downloadsSlash/ to slashCommands/ and the feature will be enabled.