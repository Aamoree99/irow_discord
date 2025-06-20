const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const configPath = path.join(__dirname, '../data/config.json');
const SOVEREIGNTY_URL = 'https://esi.evetech.net/latest/sovereignty/structures/?datasource=tranquility';

async function runSovereigntyCheck(client) {
    console.log('[CRON] 🔍 Starting sovereignty check');

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

    const channelId = config.fuelChannelId;

    if (!channelId) {
        console.warn('[CRON] ⚠️ Missing channel ID in config.');
        return;
    }

    if (!config.systems || config.systems.length === 0) {
        console.warn('[CRON] ⚠️ No systems configured for sovereignty check.');
        return;
    }

    try {
        const response = await axios.get(SOVEREIGNTY_URL);
        const sovereigntyData = response.data;
        console.log(`[CRON] 📊 Retrieved sovereignty data for ${sovereigntyData.length} structures.`);

        let postContent = "**System Sovereignty Status (ADM Levels)**\n\n";
        let warningSystems = [];
        let updatedSystems = [];

        console.log('[CRON] 📋 Full system ADM report:');
        config.systems.forEach(system => {
            const systemStructures = sovereigntyData.filter(item => item.solar_system_id === system.id);
            const systemName = system.name || `System ID: ${system.id}`;

            if (systemStructures.length > 0) {
                const maxADM = Math.max(...systemStructures.map(s => s.vulnerability_occupancy_level || 0));
                const roundedADM = Math.round(maxADM * 10) / 10;
                const status = maxADM >= 4 ? 'OK' : 'LOW';
                const statusIcon = maxADM >= 4 ? '✅' : '⚠️';

                postContent += `**${systemName}**: ADM ${roundedADM} ${statusIcon}\n`;

                if (maxADM < 4) {
                    warningSystems.push(`${systemName} (ADM ${roundedADM})`);
                }

                console.log(`[${status}] - ${systemName} | ADM: ${roundedADM} | Structures: ${systemStructures.length}`);

                updatedSystems.push({
                    id: system.id,
                    name: systemName,
                    adm_level: roundedADM,
                    structures_count: systemStructures.length,
                    last_checked: new Date().toISOString()
                });
            } else {
                postContent += `**${systemName}**: No sovereignty data\n`;
                console.log(`[NO DATA] - ${systemName} | No structures in system`);

                updatedSystems.push({
                    id: system.id,
                    name: systemName,
                    adm_level: null,
                    structures_count: 0,
                    last_checked: new Date().toISOString()
                });
            }
        });

        if (warningSystems.length > 0) {
            postContent += `\n🚨 **Warning!** Low ADM in: ${warningSystems.join(', ')}`;
            console.log(`[CRON] 🚨 ${warningSystems.length} systems with low ADM`);
        } else {
            console.log('[CRON] ✅ All systems have sufficient ADM levels.');
        }

        // Update system data in config
        config.systems = updatedSystems;

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) {
                console.warn('[CRON] ⚠️ Channel not found.');
                return;
            }

            // Управление сообщениями (исправленная версия)
            if (config.sovereigntyMessageId) {
                try {
                    // Пытаемся найти существующее сообщение
                    let existingMessage;
                    try {
                        existingMessage = await channel.messages.fetch(config.sovereigntyMessageId);
                    } catch (fetchError) {
                        console.log('[CRON] ℹ️ Existing message not found, will create new one');
                        existingMessage = null;
                    }

                    if (existingMessage) {
                        // Если сообщение найдено - редактируем его
                        await existingMessage.edit(postContent);
                        console.log('[CRON] 🔄 Updated existing sovereignty message');
                    } else {
                        // Если сообщение не найдено - создаем новое
                        const newMessage = await channel.send(postContent);
                        config.sovereigntyMessageId = newMessage.id;
                        console.log('[CRON] ✨ Created new sovereignty message (replacement for missing)');
                    }
                } catch (err) {
                    console.error('[CRON] ❌ Failed to manage messages:', err.message);
                    const newMessage = await channel.send(postContent);
                    config.sovereigntyMessageId = newMessage.id;
                    console.log('[CRON] ✨ Created new sovereignty message after error');
                }
            } else {
                // Если ID сообщения не сохранено - создаем новое сообщение
                const newMessage = await channel.send(postContent);
                config.sovereigntyMessageId = newMessage.id;
                console.log('[CRON] ✨ Created initial sovereignty message');
            }

            // Сохраняем обновленный конфиг
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('[CRON] 💾 Updated config with message ID');

        } catch (err) {
            console.error('[CRON] ❌ Failed to manage channel messages:', err.message);
            throw err;
        }

        return postContent;
    } catch (err) {
        console.error('[CRON] ❌ Failed during sovereignty check:', err?.response?.data || err.message);
        throw err;
    }
}

async function startSovereigntyCheckCron(client) {
    cron.schedule('*/30 * * * *', async () => {
        try {
            await runSovereigntyCheck(client);
        } catch (err) {
            console.error('[CRON] ❌ Error in scheduled task:', err);
        }
    }, {
        timezone: 'Etc/UTC'
    });

    console.log('[CRON] ⏰ Scheduled ADM check every 30 minutes.');
}

module.exports = {
    startSovereigntyCheckCron,
    runSovereigntyCheck
};