const { EmbedBuilder } = require('discord.js');

const STATUS_PAGE = 'https://zekbot420.statuspage.io';
const API_URL = 'https://zekbot420.statuspage.io/api/v2/summary.json';

const INDICATOR_COLORS = {
    none: 0x2ecc71,
    minor: 0xf1c40f,
    major: 0xe67e22,
    critical: 0xe74c3c,
};

const IMPACT_LABELS = {
    none: 'None',
    minor: 'Minor',
    major: 'Major',
    critical: 'Critical',
};

module.exports = {
    name: 'status',
    async execute(message, args) {
        let summary;
        try {
            const res = await fetch(API_URL);
            summary = await res.json();
        } catch {
            return message.reply('⚠️ **I could not reach the zekbot420 status page**. Try checking manually: ' + STATUS_PAGE);
        }

        const { status, incidents, scheduled_maintenances } = summary;
        const activeIncidents = incidents.filter(i => i.status !== 'resolved');
        const upcomingMaintenances = scheduled_maintenances.filter(m => m.status !== 'completed');
        const hasIssues = activeIncidents.length > 0 || upcomingMaintenances.length > 0;

        const embed = new EmbedBuilder()
            .setTitle('zekbot420 Status')
            .setURL(STATUS_PAGE)
            .setColor(INDICATOR_COLORS[status.indicator] ?? 0x95a5a6)
            .setFooter({ text: 'Requested by ' + message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        if (!hasIssues) {
            embed
                .setDescription("No known reported issues or scheduled maintenances with zekbot420 were found.\nIf you're running into issues, [join the support server to report it](https://discord.gg/g3QnnbENCM).")
                .addFields({ name: 'Overall Status', value: status.description });
            return message.reply({ embeds: [embed] });
        }

        embed.setDescription(status.description);

        if (activeIncidents.length > 0) {
            const incidentList = activeIncidents.map(i => {
                const latest = i.incident_updates?.[0]?.body ?? 'No details available.';
                return `**[${i.name}](${i.shortlink})**\nImpact: **${IMPACT_LABELS[i.impact] ?? i.impact}\n**${latest}`;
            }).join('\n\n');
            embed.addFields({ name: 'Active Incidents', value: incidentList.slice(0, 1024) });
        }

        if (upcomingMaintenances.length > 0) {
            const maintenanceList = upcomingMaintenances.map(m => {
                const start = new Date(m.scheduled_for).toUTCString();
                return `**[${m.name}](${m.shortlink})**\nScheduled: ${start}`;
            }).join('\n\n');
            embed.addFields({ name: 'Scheduled Maintenance', value: maintenanceList.slice(0, 1024) });
        }

        message.reply({ embeds: [embed] });
    }
};