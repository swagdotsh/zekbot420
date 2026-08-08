const fs = require('fs/promises');
const path = require('path');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
} = require('discord.js');

const DATA_DIR = path.resolve(process.cwd(), 'data');

const LINKS = {
    repo: 'https://github.com/swagdotsh/zekbot420',
    website: 'https://zekbot420.swagrelated.com/',
    commands: 'https://zekbot420.swagrelated.com/commands/',
    status: 'https://zekbot420.statuspage.io',
    issues: 'https://github.com/swagdotsh/zekbot420/issues',
};

function guildDir(guildId) {
    return path.join(DATA_DIR, String(guildId));
}

function introConfigPath(guildId) {
    return path.join(guildDir(guildId), 'intro.json');
}

async function ensureGuildDirExists(guildId) {
    await fs.mkdir(guildDir(guildId), { recursive: true });
}

async function hasIntroAlreadyBeenSent(guildId) {
    try {
        await fs.access(introConfigPath(guildId));
        return true;
    } catch {
        return false;
    }
}

async function markIntroAsSent(guild, channel) {
    await ensureGuildDirExists(guild.id);

    await fs.writeFile(
        introConfigPath(guild.id),
        JSON.stringify({
            guildId: guild.id,
            guildName: guild.name,
            channelId: channel.id,
            channelName: channel.name,
            sentAt: Date.now(),
        }, null, 2),
        'utf8'
    );
}

function canSendIn(channel, me) {
    if (!channel || !me) return false;

    const permissions = channel.permissionsFor(me);
    return permissions?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
    ]);
}

function findIntroChannel(guild) {
    const me = guild.members.me;

    if (canSendIn(guild.systemChannel, me)) {
        return guild.systemChannel;
    }

    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText &&
        canSendIn(channel, me)
    );
}

module.exports = (client) => {
    client.on('guildCreate', async (guild) => {
        try {
            const alreadySent = await hasIntroAlreadyBeenSent(guild.id);
            if (alreadySent) return;

            const channel = findIntroChannel(guild);

            if (!channel) {
                console.warn(`Could not find a channel to send intro message in ${guild.name} (${guild.id})`);
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('hi, im zekbot420!')
                .setDescription(
                    [
                        'thanks for adding me to ' + guild.name,
                        '',
                        'here are some useful links and setup commands to get started.',
                    ].join('\n')
                )
                .addFields(
                    {
                        name: 'quick setup commands',
                        value: [
                            '`,help` — view help and command links',
                            '`,welcomesetup` — setup welcome messages',
                            '`,setupjail` — setup the jail system',
                            '`,voicemaster` — set up temporary voice channels (VoiceMaster chanels)',
                            '`,modlog` — setup & configure moderation logging',
                        ].join('\n'),
                    }
                )
                .setFooter({
                    text: `added to ${guild.name}`,
                    iconURL: guild.iconURL() || undefined,
                })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Website')
                    .setStyle(ButtonStyle.Link)
                    .setURL(LINKS.website),
                new ButtonBuilder()
                    .setLabel('Commands')
                    .setStyle(ButtonStyle.Link)
                    .setURL(LINKS.commands),
                new ButtonBuilder()
                    .setLabel('Repo')
                    .setStyle(ButtonStyle.Link)
                    .setURL(LINKS.repo),
                new ButtonBuilder()
                    .setLabel('Status')
                    .setStyle(ButtonStyle.Link)
                    .setURL(LINKS.status)
            );

            await channel.send({
                embeds: [embed],
                components: [row],
            });

            await markIntroAsSent(guild, channel);
        } catch (error) {
            console.error(`Failed to send guild intro message for guild ${guild.id}:`, error);
        }
    });
};