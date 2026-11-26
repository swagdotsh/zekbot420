const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const github = require('../../social/github');
const twitter = require('../../social/twitter');
const instagram = require('../../social/instagram');
const roblox = require('../../social/roblox');
const sandbox = require('../../social/sandbox');
const { fail } = require('../../ui');

const HANDLERS = {
    'github profile': (o) => github.profile(o.getString('user', true)),
    'github repository': (o) => github.repository(o.getString('repo', true)),
    twitter: (o) => twitter.profile(o.getString('user', true)),
    instagram: (o) => instagram.profile(o.getString('user', true)),
    roblox: (o) => roblox.lookup(o.getString('user', true)),
    'sandbox profile': (o) => sandbox.profile(o.getString('user', true)),
    'sandbox post': (o) => sandbox.post(o.getString('post', true)),
};

const PLATFORM_NAMES = { github: 'GitHub', twitter: 'X', instagram: 'Instagram', roblox: 'Roblox', sandbox: 'sandbox' };

const userOption = (description) => (opt) => opt.setName('user').setDescription(description).setRequired(true).setMaxLength(100);

module.exports = {
    cooldown: 4,
    data: new SlashCommandBuilder()
        .setName('social')
        .setDescription('Look up profiles on GitHub, X, Instagram, Roblox, sandbox and more')
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addSubcommandGroup((group) =>
            group.setName('github').setDescription('GitHub profiles and repositories')
                .addSubcommand((sub) => sub.setName('profile').setDescription('A GitHub user or organization')
                    .addStringOption(userOption('GitHub username or profile link')))
                .addSubcommand((sub) => sub.setName('repository').setDescription('A GitHub repository')
                    .addStringOption((opt) => opt.setName('repo').setDescription('owner/name or a GitHub link, like discordjs/discord.js').setRequired(true).setMaxLength(200))))
        .addSubcommand((sub) => sub.setName('twitter').setDescription('An X (Twitter) profile')
            .addStringOption(userOption('X username or profile link')))
        .addSubcommand((sub) => sub.setName('instagram').setDescription('An Instagram profile')
            .addStringOption(userOption('Instagram username or profile link')))
        .addSubcommand((sub) => sub.setName('roblox').setDescription('A Roblox profile and avatar')
            .addStringOption(userOption('Roblox username, user ID or profile link')))
        .addSubcommandGroup((group) =>
            group.setName('sandbox').setDescription('sandbox profiles and posts')
                .addSubcommand((sub) => sub.setName('profile').setDescription('A sandbox profile')
                    .addStringOption(userOption('sandbox username or profile link')))
                .addSubcommand((sub) => sub.setName('post').setDescription('A sandbox post')
                    .addStringOption((opt) => opt.setName('post').setDescription('Post link or number').setRequired(true).setMaxLength(200)))),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        const key = group ? `${group} ${sub}` : sub;
        const handler = HANDLERS[key];
        if (!handler) return interaction.reply({ content: fail('That lookup isn\'t available.'), flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ loadingText: `Looking that up on ${PLATFORM_NAMES[group ?? sub]}...` });
        try {
            const result = await handler(interaction.options);
            if (result.error) return interaction.editReply(fail(result.error));
            return interaction.editReply({ content: '', ...result });
        } catch (error) {
            if (error instanceof github.LookupError || error instanceof sandbox.SandboxError) return interaction.editReply(fail(error.message));
            console.error(`[social] /social ${key} failed:`, error);
            return interaction.editReply(fail(`Couldn't reach ${PLATFORM_NAMES[group ?? sub]} right now. Try again in a moment.`));
        }
    },
};
