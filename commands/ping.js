module.exports = {
    name: 'ping',
    async execute(message, args) {
        const sentAt = Date.now();

        const reply = await message.reply({
            content: '<a:spinbot420:1498959085427490937> One second...',
        });

        const latency = Date.now() - sentAt;

        await reply.edit({
            content: "Pong! `"+latency+"ms`",
        });
    },
};