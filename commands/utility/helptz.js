module.exports = {
    name: 'helptz',
    aliases: ['timezones', 'tzhelp', 'tz'],

    async execute(message) {
        return message.reply(
        `A full list of GMT timezones can be found [here](https://docs.sentinel.thalesgroup.com/softwareandservices/ems/EMSdocs/WSG/Content/TimeZone.htm).
-# If you're setting up your birthday and the timezone is, for example, **GMT-05:00**, please write it as **GMT-5** on the bot.`
        );
    },
};