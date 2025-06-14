const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/config.json');

function msToTime(ms) {
    if (!ms || ms <= 0) return '⛔ Out of fuel';

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stations')
        .setDescription('Display fuel status of all known structures'),

    async execute(interaction) {
        if (!fs.existsSync(configPath)) {
            return interaction.reply({
                content: '⚠️ No configuration found.',
                ephemeral: true
            });
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const allowedRoles = config.eventCreatorRoleIds || [];
        const memberRoles = interaction.member.roles.cache;

        const hasPermission = allowedRoles.some(roleId => memberRoles.has(roleId));

        if (!hasPermission) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        if (!Array.isArray(config.stations) || config.stations.length === 0) {
            return interaction.reply({
                content: '📭 No station data available.',
                ephemeral: true
            });
        }

        const stationList = config.stations.map(station => {
            const name = station.name || 'Unnamed Structure';
            const fuelTime = msToTime(station.fuel_remaining_ms);
            const expiresAt = station.fuel_expires
                ? `<t:${Math.floor(new Date(station.fuel_expires).getTime() / 1000)}:F>`
                : '❓ Unknown';

            return `🛰️ **${name}**\n⏳ Remaining: ${fuelTime}\n📅 Expires: ${expiresAt}`;
        });

        await interaction.reply({
            content: stationList.join('\n\n'),
            ephemeral: true
        });
    }
};
