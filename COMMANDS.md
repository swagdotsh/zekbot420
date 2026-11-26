# zekbot420 commands

Every slash command added on the `features/new-commands` branch, grouped by feature, plus the new prefix commands and a list of commands that moved to a new name. Generated from the command definitions with `npm run docs:commands`.

## Contents

- [Setting up the bot](#setting-up-the-bot)
- [Welcome, goodbye and boost messages](#welcome-goodbye-and-boost-messages)
- [Booster perks](#booster-perks)
- [Reaction roles and color roles](#reaction-roles-and-color-roles)
- [Community](#community)
- [Moderation](#moderation)
- [last.fm](#lastfm)
- [Music](#music)
- [Movies and TV](#movies-and-tv)
- [Social profiles](#social-profiles)
- [Images](#images)
- [Games](#games)
- [Tools](#tools)
- [Prefix commands](#prefix-commands)
- [Renamed commands](#renamed-commands)

## Setting up the bot

Features are turned on with `/setup <feature>` and off with `/disable <feature>`. Turning something off keeps its settings, so `/setup` brings it back the way it was.

### /setup

Turn on and configure zekbot420 features

#### `/setup birthdays`

Set up the birthday system for this server

<sub>Needs Manage Server and Manage Roles - Works in servers</sub>

#### `/setup boost`

Set the channel where a thank-you message is sent when someone boosts

- `channel` (required, channel): Channel to send boost messages in

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup bumpreminder`

Remind the server to bump on DISBOARD (and other listing bots) when the cooldown ends

- `channel` (optional, channel): Where reminders go (default: the channel the bump happened in)
- `role` (optional, role): Role to ping when it's time to bump

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup colorroles`

Pick the channel for the color role panel (or let me create #colors)

- `channel` (optional, channel): Where the color panel goes (default: I create #colors)

<sub>Needs Manage Roles - Works in servers</sub>

#### `/setup confessions`

Let members post anonymous confessions in a channel

- `channel` (required, channel): The channel confessions are posted in

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup goodbye`

Set the channel where a message is sent when a member leaves

- `channel` (required, channel): Channel to send goodbye messages in

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup jail`

Set up the jail system

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup leveling`

Configure the leveling system

- `channel` (required, channel): The channel for level-up announcements
- `xp_min` (required, whole number): Minimum XP per message, from 5 to 44
- `xp_max` (required, whole number): Maximum XP per message, from 6 to 45
- `leaderboard` (required, true/false): Whether the leaderboard should be enabled

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup modlog`

Set the channel where moderation logs are sent

- `channel` (required, channel): The channel to send modlog messages to

<sub>Needs Administrator - Works in servers</sub>

#### `/setup reactionmute`

Set up reaction mute

<sub>Needs Manage Roles - Works in servers</sub>

#### `/setup socialembeds`

Reply to X and Instagram links with the post text, photos and videos

- `x` (optional, true/false): Embed X/Twitter links (default: on)
- `instagram` (optional, true/false): Embed Instagram links (default: on)
- `hide_original` (optional, true/false): Hide Discord's own link preview (needs Manage Messages)

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup starboard`

Set the channel where starred messages appear

- `channel` (required, channel): The starboard channel

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup streaks`

Announce daily message streaks in a channel

- `channel` (required, channel): Where "🔥 X day streak" messages go
- `min_days` (optional, whole number): Only announce streaks this long or longer (default: 2)

<sub>Needs Manage Server - Works in servers</sub>

#### `/setup voicemaster`

Set up VoiceMaster in a category

- `category` (required, channel): Category where the Join to Create VC should be created

<sub>Needs Administrator - Works in servers</sub>

#### `/setup welcome`

Set the channel where new members are welcomed

- `channel` (required, channel): Channel to send welcome messages in

<sub>Needs Manage Server - Works in servers</sub>

### /disable

Turn off zekbot420 features

#### `/disable boost`

Stop sending boost messages (your custom message and booster perks are kept)

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable bumpreminder`

Stop bump reminders

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable colorroles`

Delete the color panel (the color roles and list are kept)

<sub>Needs Manage Roles - Works in servers</sub>

#### `/disable confessions`

Stop accepting anonymous confessions (numbering and bans are kept)

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable goodbye`

Stop sending goodbye messages (your custom message is kept)

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable jail`

Remove the jail role, channel and settings

- `confirm` (required, true/false): Confirm that you want to remove the jail role/channel/config

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable modlog`

Stop sending moderation logs

<sub>Needs Administrator - Works in servers</sub>

#### `/disable socialembeds`

Stop replying to X and Instagram links

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable streaks`

Stop tracking and announcing message streaks (streaks so far are kept)

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable starboard`

Turn off the starboard and delete its settings

<sub>Needs Manage Server - Works in servers</sub>

#### `/disable voicemaster`

Remove the Join to Create channel and VoiceMaster settings

- `confirm` (required, true/false): Confirm that you want to delete the Join to Create VC and saved config

<sub>Needs Administrator - Works in servers</sub>

#### `/disable welcome`

Stop sending welcome messages (your custom message is kept)

<sub>Needs Manage Server - Works in servers</sub>

### /prefix

View or change the prefix for message commands

#### `/prefix view`

Show the current prefix

<sub>Works in servers</sub>

#### `/prefix set`

Change the prefix (needs Manage Server)

- `prefix` (required, text): New prefix, 1-5 characters with no spaces

<sub>Works in servers</sub>

#### `/prefix reset`

Go back to the default prefix (,)

<sub>Works in servers</sub>

## Welcome, goodbye and boost messages

Pick the channel with `/setup welcome`, `/setup goodbye` or `/setup boost`, then change the text, embed and image here. Placeholders like `{user}`, `{server}` and `{membercount_ordinal}` are filled in for each member; boost messages also have `{boostcount}` and `{boostlevel}`.

### /welcome

Customize the welcome message for new members

#### `/welcome edit`

Edit the welcome text, embed title, description, footer and color

<sub>Needs Manage Server - Works in servers</sub>

#### `/welcome style`

Change how the welcome message looks

- `embed` (optional, true/false): Show the embed (off = text message only)
- `avatar` (optional, true/false): Show the member's avatar in the embed
- `image` (optional, text): Big image/GIF link at the bottom of the embed, or "none" to remove

<sub>Needs Manage Server - Works in servers</sub>

#### `/welcome test`

Preview the welcome message

<sub>Needs Manage Server - Works in servers</sub>

#### `/welcome placeholders`

List the placeholders you can use

<sub>Needs Manage Server - Works in servers</sub>

#### `/welcome reset`

Reset the welcome message to the default

<sub>Needs Manage Server - Works in servers</sub>

### /goodbye

Customize the message sent when a member leaves

#### `/goodbye edit`

Edit the goodbye text, embed title, description, footer and color

<sub>Needs Manage Server - Works in servers</sub>

#### `/goodbye style`

Change how the goodbye message looks

- `embed` (optional, true/false): Show the embed (off = text message only)
- `avatar` (optional, true/false): Show the member's avatar in the embed
- `image` (optional, text): Big image/GIF link at the bottom of the embed, or "none" to remove

<sub>Needs Manage Server - Works in servers</sub>

#### `/goodbye test`

Preview the goodbye message

<sub>Needs Manage Server - Works in servers</sub>

#### `/goodbye placeholders`

List the placeholders you can use

<sub>Needs Manage Server - Works in servers</sub>

#### `/goodbye reset`

Reset the goodbye message to the default

<sub>Needs Manage Server - Works in servers</sub>

### /boost

Customize the message sent when someone boosts the server

#### `/boost edit`

Edit the boost text, embed title, description, footer and color

<sub>Needs Manage Server - Works in servers</sub>

#### `/boost style`

Change how the boost message looks

- `embed` (optional, true/false): Show the embed (off = text message only)
- `avatar` (optional, true/false): Show the member's avatar in the embed
- `image` (optional, text): Big image/GIF link at the bottom of the embed, or "none" to remove

<sub>Needs Manage Server - Works in servers</sub>

#### `/boost test`

Preview the boost message

<sub>Needs Manage Server - Works in servers</sub>

#### `/boost placeholders`

List the placeholders you can use

<sub>Needs Manage Server - Works in servers</sub>

#### `/boost reset`

Reset the boost message to the default

<sub>Needs Manage Server - Works in servers</sub>

## Booster perks

Perk roles are given when someone boosts and taken back when the boost ends. Only roles the bot gave are taken back. Booster channels are hidden from everyone except Discord's Server Booster role.

### /boostperks

Roles and channels for server boosters

#### `/boostperks role add`

Give boosters a role while they boost

- `role` (required, role): The perk role

<sub>Needs Manage Server - Works in servers</sub>

#### `/boostperks role remove`

Stop giving boosters a role

- `role` (required, role): The perk role
- `take_back` (optional, true/false): Take it from boosters who got it (default: yes)

<sub>Needs Manage Server - Works in servers</sub>

#### `/boostperks channel add`

Make a channel booster-only, or create a new one

- `channel` (optional, channel): Existing channel to make booster-only
- `name` (optional, text): Or: name for a new booster-only text channel

<sub>Needs Manage Server - Works in servers</sub>

#### `/boostperks channel remove`

Stop making a channel booster-only

- `channel` (required, channel): The booster channel
- `make_public` (optional, true/false): Let everyone see it again (default: yes)

<sub>Needs Manage Server - Works in servers</sub>

#### `/boostperks list`

Show the booster perks

<sub>Needs Manage Server - Works in servers</sub>

## Reaction roles and color roles

Roles with moderator permissions (Administrator, Manage Server, Ban Members and so on) can't be given out by reacting. Color roles are created right under the bot's highest role so the color shows, and the panel in the colors channel updates every time a color is added or removed. Members can only wear one color at a time.

### /reactionrole

Let members get roles by reacting to a message

#### `/reactionrole post`

Post a reaction role panel that lists its roles

- `title` (required, text): Panel title, like "Pick your pronouns"
- `description` (optional, text): Text above the roles (use \n for a new line)
- `channel` (optional, channel): Where to post it (default: here)
- `unique` (optional, true/false): Members can only have one role from this panel (default: no)

<sub>Needs Manage Roles - Works in servers</sub>

#### `/reactionrole add`

Give a role when someone reacts to a message with an emoji

- `message` (required, text): Message link, or a message ID from this channel
- `emoji` (required, text): The emoji to react with
- `role` (required, role): The role to give
- `unique` (optional, true/false): Members can only have one role from this message

<sub>Needs Manage Roles - Works in servers</sub>

#### `/reactionrole remove`

Remove one reaction role from a message

- `message` (required, text): Message link, or a message ID from this channel
- `emoji` (required, text): The emoji to react with

<sub>Needs Manage Roles - Works in servers</sub>

#### `/reactionrole clear`

Remove every reaction role from a message (deletes bot panels)

- `message` (required, text): Message link, or a message ID from this channel

<sub>Needs Manage Roles - Works in servers</sub>

#### `/reactionrole list`

Show every reaction role in this server

<sub>Needs Manage Roles - Works in servers</sub>

### /colorrole

Name color roles members pick by reacting

#### `/colorrole add`

Create a color role and add it to the color panel

- `name` (required, text): Role name, like "Pink"
- `color` (required, text): Hex code like #ff66cc, or a color name like pink
- `emoji` (optional, text): Emoji to react with (default: I pick one close to the color)

<sub>Needs Manage Roles - Works in servers</sub>

#### `/colorrole remove`

Take a color off the panel

- `role` (required, role): The color role
- `delete_role` (optional, true/false): Delete the role too (default: yes)

<sub>Needs Manage Roles - Works in servers</sub>

#### `/colorrole list`

Show the color roles

<sub>Needs Manage Roles - Works in servers</sub>

#### `/colorrole refresh`

Repost or fix the color panel

<sub>Needs Manage Roles - Works in servers</sub>

## Community

Streaks need a channel set with `/setup streaks`; a day runs midnight to midnight in each member's `/time timezone` (UTC if they haven't set one). Confessions need `/setup confessions`, and bump reminders `/setup bumpreminder`.

### /streak

Daily message streaks: send a message every day to keep yours going

#### `/streak view`

See your streak or someone else's

- `user` (optional, user): Whose streak to see (default: yours)

<sub>Works in servers</sub>

#### `/streak leaderboard`

The longest streaks going right now

<sub>Works in servers</sub>

### /confess

Post an anonymous confession

#### `/confess`

Post an anonymous confession

- `confession` (required, text): What you want to confess (nobody will see your name)
- `image` (optional, file): Optional image to include

<sub>Works in servers</sub>

### /confession

Moderate anonymous confessions

#### `/confession ban`

Stop the author of a confession from confessing (stays anonymous)

- `number` (required, text): Confession number, like 12, or a reply ID like r5

<sub>Needs Manage Messages - Works in servers</sub>

#### `/confession unban`

Let the author of a confession confess again

- `number` (required, text): Confession number, like 12, or a reply ID like r5

<sub>Needs Manage Messages - Works in servers</sub>

### /bumpreminder

Bump reminders for server listing bots like DISBOARD

#### `/bumpreminder status`

Show when each bot can be bumped next

<sub>Needs Manage Server - Works in servers</sub>

#### `/bumpreminder addbot`

Track another listing bot's /bump (DISBOARD is built in)

- `bot` (required, user): The listing bot
- `hours` (required, number): Its bump cooldown in hours, like 2 or 24

<sub>Needs Manage Server - Works in servers</sub>

#### `/bumpreminder removebot`

Stop tracking a listing bot you added

- `bot` (required, user): The listing bot

<sub>Needs Manage Server - Works in servers</sub>

#### `/bumpreminder message`

Change the reminder text ({bot} and {command} are filled in)

- `text` (required, text): Reminder text, or "default" to reset

<sub>Needs Manage Server - Works in servers</sub>

### /level

Levels: your rank, the leaderboard and leveling settings

#### `/level rank`

Show your or another user's rank

- `user` (optional, user): The user to check

<sub>Works in servers</sub>

#### `/level leaderboard`

Show the server XP leaderboard

<sub>Works in servers</sub>

#### `/level channel`

Set the channel for level-up announcements

- `channel` (required, channel): The channel where level-up announcements should be sent

<sub>Needs Manage Server - Works in servers</sub>

#### `/level role set`

Set a role to be assigned at a specific level

- `level` (required, whole number): The level required for this role
- `role` (required, role): The role to assign at this level

<sub>Needs Manage Server - Works in servers</sub>

#### `/level role remove`

Stop giving a role at a specific level

- `level` (required, whole number): The level to remove the role from

<sub>Needs Manage Server - Works in servers</sub>

#### `/level role list`

List configured level roles

<sub>Needs Manage Server - Works in servers</sub>

### /birthday

Set, remove or view birthdays

#### `/birthday set`

Set your birthday for this server

- `date` (required, text): Your birthday, like 04/20 or 04/20/2004
- `timezone` (required, text): Your GMT timezone, like GMT-5, GMT+1, -8, or +05:30

<sub>Works in servers</sub>

#### `/birthday remove`

Remove your birthday from this server

<sub>Works in servers</sub>

#### `/birthday list`

View server birthdays or a specific user's birthday

- `user` (optional, user): User to check birthday for

<sub>Works in servers</sub>

### /giveaway

Start, end or delete giveaways

#### `/giveaway start`

Start a giveaway

- `duration` (required, text): Duration of the giveaway, e.g. 10m, 2h, 1d
- `dm_winner` (required, true/false): Whether to DM the winner
- `channel` (required, channel): Channel to post the giveaway in
- `title` (required, text): Giveaway title/prize

<sub>Needs Moderate Members - Works in servers</sub>

#### `/giveaway end`

End a giveaway early and pick a winner

- `giveaway_id` (required, whole number): The giveaway ID

<sub>Needs Moderate Members - Works in servers</sub>

#### `/giveaway delete`

Delete/cancel an active giveaway

- `giveaway_id` (required, whole number): The giveaway ID

<sub>Needs Moderate Members - Works in servers</sub>

### /starboard

Change starboard settings

#### `/starboard threshold`

Set how many stars a message needs for starboard

- `stars` (required, whole number): Number of stars required, from 1 to 1000

<sub>Needs Manage Server - Works in servers</sub>

#### `/starboard emoji`

Set the emoji that counts toward the starboard

- `emoji` (required, text): A standard emoji or custom emoji such as <:star:123>

<sub>Needs Manage Server - Works in servers</sub>

#### `/starboard selfstar`

Choose whether users can star their own messages

- `enabled` (required, true/false): Whether self-stars count toward starboard

<sub>Needs Manage Server - Works in servers</sub>

### /stickyroles

Roles that members get back when they rejoin

#### `/stickyroles mode`

Turn sticky roles on or off, or view the status

- `action` (required, text, one of: Enable, Disable, View Status): Enable or disable sticky roles

<sub>Needs Manage Server - Works in servers</sub>

#### `/stickyroles add`

Add a sticky role

- `role` (required, role): The role to mark as sticky

<sub>Needs Manage Server - Works in servers</sub>

#### `/stickyroles remove`

Remove a sticky role

- `role` (required, role): The role to remove from sticky roles

<sub>Needs Manage Server - Works in servers</sub>

#### `/stickyroles user add`

Add a sticky role to a user

- `user` (required, user): The user to add sticky role to
- `role` (required, role): The role to add as sticky

<sub>Needs Manage Server - Works in servers</sub>

#### `/stickyroles user remove`

Remove a sticky role from a user

- `user` (required, user): The user to remove sticky role from
- `role` (required, role): The role to remove from sticky

<sub>Needs Manage Server - Works in servers</sub>

## Moderation

### /warn

Warn members and see warnings

#### `/warn add`

Warn a member

- `user` (required, user): The user to warn
- `reason` (optional, text): Reason for the warning

<sub>Needs Moderate Members - Works in servers</sub>

#### `/warn remove`

Remove warnings from a member

- `user` (required, user): The user to remove warnings from
- `mode` (optional, text, one of: Most recent warning, Specific warning ID): How to remove warnings
- `amount` (optional, whole number): Amount of recent warnings to remove
- `warn_id` (optional, whole number): Specific warning ID to remove
- `note` (optional, text): Optional note for the unwarn

<sub>Needs Moderate Members - Works in servers</sub>

#### `/warn list`

View your warnings or another user’s warnings

- `user` (optional, user): The user to view warnings for

<sub>Works in servers</sub>

### /timeout

Timeout members

#### `/timeout add`

Timeout a member from the server

- `user` (required, user): The user to timeout
- `duration` (required, text): Timeout duration, for example 1m, 1h, or 1d
- `reason` (optional, text): Reason for the timeout

<sub>Needs Moderate Members - Works in servers</sub>

#### `/timeout remove`

Remove a timeout from a member

- `user` (required, user): The user to remove timeout from

<sub>Needs Moderate Members - Works in servers</sub>

### /jail

Jail members

#### `/jail add`

Jail a member

- `user` (required, user): The user to jail
- `duration` (optional, text): Optional duration, for example 10m, 2h, 1d

<sub>Needs Moderate Members - Works in servers</sub>

#### `/jail remove`

Unjail a member

- `user` (required, user): The user to unjail

<sub>Needs Moderate Members - Works in servers</sub>

### /ban

Ban and unban members

#### `/ban add`

Ban a member from the server

- `user` (required, user): The user to ban
- `reason` (optional, text): Reason for the ban

<sub>Needs Ban Members - Works in servers</sub>

#### `/ban remove`

Unban a user from the server

- `identifier` (required, text): User ID or tag to unban

<sub>Needs Ban Members - Works in servers</sub>

### /reactionmute

Stop members from adding reactions

#### `/reactionmute add`

Prevent a member from adding reactions

- `user` (required, user): The user to reaction mute
- `reason` (optional, text): Reason for the reaction mute

<sub>Needs Manage Roles - Works in servers</sub>

#### `/reactionmute remove`

Remove a reaction mute from a member

- `user` (required, user): The user to remove reaction mute from
- `reason` (optional, text): Reason for removing the reaction mute

<sub>Needs Manage Roles - Works in servers</sub>

### /snipe

See recently deleted messages and removed reactions

#### `/snipe message`

Show a recently deleted message in this channel

- `index` (optional, whole number): Which deleted message to snipe

<sub>Works in servers</sub>

#### `/snipe reaction`

View a recently removed reaction

<sub>Works in servers</sub>

#### `/snipe clear`

Clear the snipe data for this channel

<sub>Needs Manage Messages - Works in servers</sub>

### /react

Add or remove the bot's reactions on a message

#### `/react add`

Add a reaction to a message.

- `emoji` (required, text): The emoji to react with.
- `message_id` (required, text): The ID of the message to react to.

<sub>Needs Manage Messages - Works in servers</sub>

#### `/react remove`

Remove one of the bot reactions from a message.

- `emoji` (required, text): The emoji reaction to remove.
- `message_id` (required, text): The ID of the message to remove the reaction from.

<sub>Needs Manage Messages - Works in servers</sub>

#### `/react clear`

Remove all reactions from a message.

- `message_id` (required, text): The ID of the message to remove all reactions from.

<sub>Needs Manage Messages - Works in servers</sub>

### /vc

Manage your VoiceMaster voice channel

#### `/vc lock`

Lock or unlock your VoiceMaster VC

<sub>Works in servers</sub>

#### `/vc limit`

Set or remove the user limit for your VoiceMaster VC

- `limit` (optional, whole number): User limit from 2-99. Use 0 or leave blank to remove the limit.

<sub>Works in servers</sub>

#### `/vc rename`

Rename your VoiceMaster VC

- `name` (optional, text): New VC name. Leave blank to reset to the default name.

<sub>Works in servers</sub>

#### `/vc kick`

Kick a user from your VoiceMaster VC

- `user` (required, user): The user to kick from your VC

<sub>Works in servers</sub>

#### `/vc delete`

Delete your VoiceMaster VC

<sub>Works in servers</sub>

#### `/vc ban add`

Ban a member from joining voice channels

- `user` (required, user): Member to VC ban
- `duration` (optional, text): How long, like 30m, 2h or 7d (default: until removed)
- `reason` (optional, text): Why (sent to them in a DM)

<sub>Needs Move Members - Works in servers</sub>

#### `/vc ban remove`

Let a member join voice channels again

- `user` (required, user): Member to un-VC ban

<sub>Needs Move Members - Works in servers</sub>

#### `/vc ban list`

List VC banned members

<sub>Needs Move Members - Works in servers</sub>

## last.fm

Link your account once with `/fm connect`. Artist charts and artist pictures use Spotify artist photos when the bot has Spotify keys.

### /fm

last.fm: what you're playing, your stats and linking your account

#### `/fm np`

Show your current or most recently played track

- `username` (optional, text): last.fm username (optional if linked)

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm connect`

Link your Discord account to last.fm

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm disconnect`

Unlink your last.fm account

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm profile`

Show a summary of your linked last.fm profile

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm cover`

Show the album cover for your last played track (last.fm)

- `username` (optional, text): last.fm username (optional if linked)

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm chart`

Build a last.fm album or artist collage

- `type` (required, text, one of: Albums, Artists): What to chart
- `size` (required, text, one of: 1x1, 1x2, 1x3, 1x4, 1x5, 2x1, 2x2, 2x3, 2x4, 2x5, 3x1, 3x2, 3x3, 3x4, 3x5, 4x1, 4x2, 4x3, 4x4, 4x5, 5x1, 5x2, 5x3, 5x4, 5x5): Grid size
- `period` (optional, text, one of: Past 7 days, Past 30 days, Past 3 months, Past 6 months, Past year, All-time): Listening period
- `username` (optional, text): last.fm username, optional if linked

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm topartists`

Show a last.fm user’s top artists

- `username` (optional, text): last.fm username, optional if linked
- `period` (optional, text, one of: Week, Month, Year): Time period

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm topalbums`

Show a last.fm user’s top albums

- `username` (optional, text): last.fm username, optional if linked
- `period` (optional, text, one of: Week, Month, Year): Time period

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm toptracks`

Show a last.fm user’s top tracks

- `username` (optional, text): last.fm username, optional if linked
- `period` (optional, text, one of: Week, Month, Year): Time period

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm albumplays`

Show your play count for an album on last.fm

- `album` (optional, text): Album name, optional to use your current/recent album
- `artist` (optional, text): Artist name, required if album is provided
- `username` (optional, text): last.fm username, optional if linked

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/fm trackplays`

Show your play count for a track on last.fm

- `track` (optional, text): Track name, optional to use your current/recent track
- `artist` (optional, text): Artist name, required if track is provided
- `username` (optional, text): last.fm username, optional if linked

<sub>Works anywhere, including DMs and servers without the bot</sub>

## Music

Shazam finds the song in a video or audio file and replies with Apple Music and Spotify links above the result. Long videos are sampled at a few points, so the song doesn't need to start at the beginning.

### /shazam

Find the song playing in a video or audio file

#### `/shazam`

Find the song playing in a video or audio file

- `file` (optional, file): A video or audio file
- `link` (optional, text): A link to a Discord message with a video, or to a media file

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### Shazam (message menu)

Right-click a message > Apps > Shazam

<sub>Works anywhere, including DMs and servers without the bot</sub>

### /metadata

View or edit the tags on an audio file

#### `/metadata view`

Show the tags, cover art and explicit/clean advisory of an audio file

- `file` (required, file): The audio file (MP3, M4A, AAC, FLAC, OGG, Opus or WAV)

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/metadata edit`

Change tags and get the edited file back (empty a tag with "-")

- `file` (required, file): The audio file (MP3, M4A, AAC, FLAC, OGG, Opus or WAV)
- `advisory` (optional, text, one of: Explicit, Clean, None): iTunes explicit/clean advisory (ITUNESADVISORY)
- `title` (optional, text): Title ("-" to remove)
- `artist` (optional, text): Artist ("-" to remove)
- `album` (optional, text): Album ("-" to remove)
- `albumartist` (optional, text): Album artist ("-" to remove)
- `genre` (optional, text): Genre ("-" to remove)
- `year` (optional, text): Year ("-" to remove)
- `track` (optional, text): Track ("-" to remove)
- `disc` (optional, text): Disc ("-" to remove)
- `composer` (optional, text): Composer ("-" to remove)
- `comment` (optional, text): Comment ("-" to remove)
- `cover` (optional, file): New cover art image (JPG or PNG)
- `remove_cover` (optional, true/false): Remove the cover art

<sub>Works anywhere, including DMs and servers without the bot</sub>

## Movies and TV

Start typing a title and pick it from the list. Data comes from TMDB.

### /movie

Look up a movie: plot, rating, cast and where to watch

#### `/movie`

Look up a movie: plot, rating, cast and where to watch

- `title` (required, text, suggests as you type): The movie to look up (pick one from the list or type a title)

<sub>Works anywhere, including DMs and servers without the bot</sub>

### /show

Look up a TV show: plot, rating, cast and where to watch

#### `/show`

Look up a TV show: plot, rating, cast and where to watch

- `title` (required, text, suggests as you type): The TV show to look up (pick one from the list or type a title)

<sub>Works anywhere, including DMs and servers without the bot</sub>

## Social profiles

### /social

Look up profiles on GitHub, X, Instagram, Roblox, sandbox and more

#### `/social github profile`

A GitHub user or organization

- `user` (required, text): GitHub username or profile link

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/social github repository`

A GitHub repository

- `repo` (required, text): owner/name or a GitHub link, like discordjs/discord.js

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/social twitter`

An X (Twitter) profile

- `user` (required, text): X username or profile link

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/social instagram`

An Instagram profile

- `user` (required, text): Instagram username or profile link

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/social roblox`

A Roblox profile and avatar

- `user` (required, text): Roblox username, user ID or profile link

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/social sandbox profile`

A sandbox profile

- `user` (required, text): sandbox username or profile link

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/social sandbox post`

A sandbox post

- `post` (required, text): Post link or number

<sub>Works anywhere, including DMs and servers without the bot</sub>

## Images

Image effects are powered by [esmBot](https://github.com/esmBot/esmBot) (MIT, see `esmBot/LICENSE`). With no image or link, the bot uses the latest image in the channel. Some effects use `text` (put a comma between top and bottom text), `amount`, `font` or `option`; the effect list shows which.

### /image

Edit an image with one of many effects (powered by esmBot)

#### `/image`

Edit an image with one of many effects (powered by esmBot)

- `effect` (required, text, suggests as you type): The effect to apply
- `image` (optional, file): The image to edit (default: the latest image in the channel)
- `link` (optional, text): Or: a link to the image
- `text` (optional, text): Text for caption, meme, motivate... (use a comma to split top/bottom)
- `amount` (optional, number): Number some effects use (shown next to the effect name)
- `font` (optional, text, one of: futura, impact, helvetica, arial, roboto, noto, times, comic sans ms, ubuntu): Font for text effects
- `option` (optional, true/false): Extra switch some effects have (e.g. snow globe, caption on top)
- `gif` (optional, true/false): Output a GIF

<sub>Works anywhere, including DMs and servers without the bot</sub>

## Games

### /game

Play games: rock paper scissors, tic-tac-toe, Akinator and flags

#### `/game rps`

Play rock paper scissors against the bot or someone else

- `opponent` (optional, user): Who to play against (default: me)

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/game tictactoe`

Play tic-tac-toe against someone or against zekbot420

- `opponent` (optional, user): Who to challenge (leave empty to play the bot)
- `difficulty` (optional, text, one of: Easy, Hard (unbeatable)): Bot difficulty (default: hard)

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/game akinator`

Think of a character and Akinator will guess who it is

- `child_mode` (optional, true/false): Leave out adult characters (default: on)

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/game flags play`

Start a flag guessing game in this channel

- `rounds` (optional, whole number): How many flags (default 5)

<sub>Works in servers</sub>

#### `/game flags leaderboard`

Top flag guessers in this server

<sub>Works in servers</sub>

## Tools

### /time

Timezones, time conversion, reminders and timers

#### `/time convert`

Convert a time to your saved timezone

- `time` (required, text): The time to convert, like 5PM EST, 7:30 PM PST, or 22:00 GMT+2

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/time timezone`

Set your timezone

- `timezone` (required, text): Your GMT timezone, like GMT-5, GMT+1, -8, or +05:30

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/time zones`

Get help with GMT timezone formats

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/time remind`

Set a reminder

- `date` (required, text): When: 10m, 2h30m, 3d, 1w, or MM-DD-YYYY
- `reason` (optional, text): What it is for

<sub>Works in servers and DMs with the bot</sub>

#### `/time timer`

Set a timer

- `time` (required, text): Duration, e.g. 10m, 2h, 3d. Numbers default to minutes.
- `reason` (optional, text): What it is for

<sub>Works in servers and DMs with the bot</sub>

### /translate

Translate text, properly or badly

#### `/translate text`

Translate text to another language

- `text` (required, text): The text to translate
- `target` (optional, text): Language to translate to, for example en, es, fr, ja
- `source` (optional, text): Source language, or leave blank for auto-detect

<sub>Works in servers and DMs with the bot</sub>

#### `/translate bad`

Badly translate text word-by-word

- `source` (required, text): Source language code, example: en
- `destination` (required, text): Destination language code, example: fr
- `text` (required, text): The text to badly translate

<sub>Works in servers and DMs with the bot</sub>

### /emoji

Add emoji to the server or get an emoji's image

#### `/emoji add`

Add an emoji to the server from a link or attachment

- `name` (required, text): The emoji name
- `url` (optional, text): A direct image/gif URL
- `file` (optional, file): An image/gif file to use as the emoji

<sub>Works in servers</sub>

#### `/emoji fetch`

Fetch the raw image file for a custom Discord emoji

- `emoji` (required, text): The custom Discord emoji to fetch

<sub>Works in servers</sub>

### /user

See someone's avatar and banner

#### `/user avatar`

Show a user’s avatar

- `user` (optional, user): User to show the avatar for

<sub>Works in servers and DMs with the bot</sub>

#### `/user banner`

Show a user’s banner

- `user` (optional, user): User to show the banner for

<sub>Works in servers and DMs with the bot</sub>

#### `/user serveravatar`

Show a user’s server-specific profile picture

- `user` (optional, user): User to show the server-specific profile picture for

<sub>Works in servers</sub>

#### `/user serverbanner`

Show a user’s server-specific banner

- `user` (optional, user): User to show the server-specific banner for

<sub>Works in servers</sub>

### /bot

About zekbot420: info, latency, status and uptime

#### `/bot info`

Show information about zekbot420

<sub>Works in servers and DMs with the bot</sub>

#### `/bot ping`

Check the bot latency

<sub>Works anywhere, including DMs and servers without the bot</sub>

#### `/bot status`

Check zekbot420 service status

<sub>Works in servers and DMs with the bot</sub>

#### `/bot uptime`

Show how long zekbot420 has been online

<sub>Works in servers and DMs with the bot</sub>

### /fortnite

Fortnite stats and the item shop

#### `/fortnite stats`

Fetch Fortnite BR stats for a player

- `username` (required, text): The player's username
- `platform` (optional, text, one of: Epic, PlayStation, Xbox): Account platform (default: epic)
- `window` (optional, text, one of: Lifetime, Season): Time window (default: lifetime)

<sub>Works in servers and DMs with the bot</sub>

#### `/fortnite shop`

View the current Fortnite item shop

- `section` (optional, text, one of: Featured, Daily): Which section to view (default: featured)

<sub>Works in servers and DMs with the bot</sub>

## Prefix commands

The default prefix is `,`; each server can change it with `/prefix set`.

| Command | What it does |
| --- | --- |
| `,fm` | What you're playing on last.fm. `,fm connect` and `,fm disconnect` link and unlink your account. |
| `,am` / `,spotify` | Link the song you're playing on last.fm on Apple Music or Spotify. Also `,am @user` or `,am <last.fm name>`. |
| `,shazam` | Find the song in an attached video or audio file, or in the message you reply to. |
| `,movie <title>` / `,show <title>` | Look up a movie or TV show (also `,film`, `,tv` and `,series`). |

## Renamed commands

These commands still work the same way under their new names.

| Old | New |
| --- | --- |
| `/nowplaying` | `/fm np` |
| `/connectfm` | `/fm connect` |
| `/disconnectfm` | `/fm disconnect` |
| `/fmprofile` | `/fm profile` |
| `/cover` | `/fm cover` |
| `/chart` | `/fm chart` |
| `/topartists, /topalbums, /toptracks` | `/fm topartists, /fm topalbums, /fm toptracks` |
| `/albumplays, /trackplays` | `/fm albumplays, /fm trackplays` |
| `/rank, /leaderboard` | `/level rank, /level leaderboard` |
| `/warn, /unwarn, /warnings` | `/warn add, /warn remove, /warn list` |
| `/timeout, /untimeout` | `/timeout add, /timeout remove` |
| `/jail, /unjail` | `/jail add, /jail remove` |
| `/ban, /unban` | `/ban add, /ban remove` |
| `/reactionmute, /unreactionmute` | `/reactionmute add, /reactionmute remove` |
| `/snipe, /rs, /clearsnipe` | `/snipe message, /snipe reaction, /snipe clear` |
| `/react, /removereact, /removeallreacts` | `/react add, /react remove, /react clear` |
| `/addemoji, /fetchemoji` | `/emoji add, /emoji fetch` |
| `/avatar, /banner, /serveravatar, /serverbanner` | `/user avatar, /user banner, /user serveravatar, /user serverbanner` |
| `/info, /ping, /status, /uptime` | `/bot info, /bot ping, /bot status, /bot uptime` |
| `/lvc, /sl, /rmvc, /kvc, /dvc, /vcban` | `/vc lock, /vc limit, /vc rename, /vc kick, /vc delete, /vc ban` |
| `/convert time, /set timezone, /helptz` | `/time convert, /time timezone, /time zones` |
| `/remindme, /settimer` | `/time remind, /time timer` |
| `/translate, /badtranslate` | `/translate text, /translate bad` |
| `/fnstats, /itemshop` | `/fortnite stats, /fortnite shop` |
| `/rps, /tictactoe, /akinator, /flags` | `/game rps, /game tictactoe, /game akinator, /game flags` |
| `/roblox` | `/social roblox` |
