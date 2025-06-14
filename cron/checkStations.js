// cron/checkStations.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { refreshAccessToken, fetchCorporationStructures } = require('../auth-server');

const configPath = path.join(__dirname, '../data/config.json');

/**
 * ⏰ Setup daily cron to check station fuel levels
 */
async function startFuelCheckCron(client) {
    cron.schedule('0 11 * * *', async () => {
        console.log('[CRON] Running station fuel check...');

        if (!fs.existsSync(configPath)) return;

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const discordId = Object.keys(config.tokens || {})[0];
        const tokenData = config.tokens?.[discordId];
        const channelId = config.fuelChannelId;

        if (!discordId || !tokenData || !channelId) return;

        try {
            const newToken = await refreshAccessToken(tokenData.refresh_token);
            config.tokens[discordId] = {
                access_token: newToken.access_token,
                refresh_token: newToken.refresh_token
            };

            const stations = await fetchCorporationStructures(newToken.access_token);
            config.stations = stations.map(s => ({
                id: s.structure_id,
                name: s.name,
                fuel_expires: s.fuel_expires,
                fuel_remaining_ms: s.fuel_remaining_ms
            }));

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            const lowFuelStations = config.stations.filter(s =>
                s.fuel_remaining_ms !== null &&
                s.fuel_remaining_ms < 7 * 24 * 60 * 60 * 1000
            );

            if (lowFuelStations.length > 0) {
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    const message = lowFuelStations.map(s => {
                        const expires = s.fuel_expires
                            ? `<t:${Math.floor(new Date(s.fuel_expires).getTime() / 1000)}:F>`
                            : '❓ Unknown';
                        return `⚠️ **${s.name || 'Unnamed'}**\n🗓️ Expires: ${expires}`;
                    }).join('\n\n');

                    await channel.send(`🚨 **Fuel Warning**: One or more structures have less than 7 days of fuel:\n\n${message}`);
                    console.log('[CRON] Fuel warning sent.');
                }
            } else {
                console.log('[CRON] All stations have sufficient fuel.');
            }
        } catch (err) {
            console.error('[CRON] Failed to complete fuel check:', err?.response?.data || err.message);
        }
    }, {
        timezone: 'Etc/UTC'
    });

    console.log('[CRON] Scheduled daily fuel check at 11:00 UTC.');
}

module.exports = startFuelCheckCron;
