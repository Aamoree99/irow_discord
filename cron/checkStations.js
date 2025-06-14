const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { refreshAccessToken, fetchCorporationStructures } = require('../auth-server');

const configPath = path.join(__dirname, '../data/config.json');

function msToTime(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return `${days}d ${hours}h ${minutes}m`;
}

async function runFuelCheck(client) {
    console.log('[CRON] 🔍 Starting fuel check');

    if (!fs.existsSync(configPath)) {
        console.warn('[CRON] ⚠️ config.json not found.');
        return;
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('[CRON] ✅ config.json loaded.');
    } catch (err) {
        console.error('[CRON] ❌ Failed to parse config.json:', err.message);
        return;
    }

    const discordId = Object.keys(config.tokens || {})[0];
    const tokenData = config.tokens?.[discordId];
    const channelId = config.fuelChannelId;

    if (!discordId || !tokenData || !channelId) {
        console.warn('[CRON] ⚠️ Missing token or fuelChannelId in config.');
        return;
    }

    try {
        const newToken = await refreshAccessToken(tokenData.refresh_token);
        console.log('[CRON] 🔄 Token refreshed.');

        config.tokens[discordId] = {
            access_token: newToken.access_token,
            refresh_token: newToken.refresh_token
        };

        const stations = await fetchCorporationStructures(newToken.access_token);
        console.log(`[CRON] 📦 Retrieved ${stations.length} stations.`);

        config.stations = stations.map(s => ({
            id: s.structure_id,
            name: s.name,
            fuel_expires: s.fuel_expires,
            fuel_remaining_ms: s.fuel_remaining_ms
        }));

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('[CRON] 💾 config.json updated.');

        console.log('[CRON] 📋 Full station fuel report:');
        config.stations.forEach(s => {
            const expires = s.fuel_expires
                ? new Date(s.fuel_expires).toISOString()
                : 'Unknown';

            const remaining = s.fuel_remaining_ms === null
                ? '⛔ Out of fuel'
                : `${msToTime(s.fuel_remaining_ms)}`;

            const status = s.fuel_remaining_ms === null
                ? '[NO FUEL]'
                : s.fuel_remaining_ms < 7 * 24 * 60 * 60 * 1000
                    ? '[LOW]'
                    : '[OK]';

            console.log(`${status} - ${s.name || 'Unnamed'} | ${remaining} | Expires: ${expires}`);
        });


        const lowFuelStations = config.stations.filter(s =>
            s.fuel_remaining_ms === null || s.fuel_remaining_ms < 7 * 24 * 60 * 60 * 1000
        );

        if (lowFuelStations.length > 0) {
            console.log(`[CRON] 🚨 ${lowFuelStations.length} stations are low on fuel.`);

            try {
                const channel = await client.channels.fetch(channelId);

                if (!channel) {
                    console.warn('[CRON] ⚠️ Fuel channel not found.');
                    return;
                }

                const message = lowFuelStations.map(s => {
                    const expires = s.fuel_expires
                        ? `<t:${Math.floor(new Date(s.fuel_expires).getTime() / 1000)}:F>`
                        : '❓ Unknown';

                    const remaining = s.fuel_remaining_ms === null
                        ? '⛔ Out of fuel'
                        : `⏳ Remaining: ${msToTime(s.fuel_remaining_ms)}`;

                    return `🛰️ **${s.name || 'Unnamed'}**\n${remaining}\n📅 Expires: ${expires}`;
                }).join('\n\n');

                await channel.send(`🚨 **Fuel Warning**: One or more structures have less than 7 days of fuel:\n\n${message}`);
                console.log('[CRON] ✅ Fuel warning sent.');
            } catch (err) {
                console.error('[CRON] ❌ Failed to send message to channel:', err.message);
            }
        } else {
            console.log('[CRON] ✅ All stations have sufficient fuel.');
        }

    } catch (err) {
        console.error('[CRON] ❌ Failed during fuel check:', err?.response?.data || err.message);
    }
}

async function startFuelCheckCron(client) {
    // Расписание: ежедневно в 11:00 UTC
    cron.schedule('0 11 * * *', async () => {
        await runFuelCheck(client);
    }, {
        timezone: 'Etc/UTC'
    });

    console.log('[CRON] ⏰ Scheduled daily fuel check at 11:00 UTC.');
}

module.exports = {
    startFuelCheckCron,
    runFuelCheck
};
