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
            // Находим все структуры в этой системе
            const systemStructures = sovereigntyData.filter(item => item.solar_system_id === system.id);
            const systemName = system.name || `System ID: ${system.id}`;

            if (systemStructures.length > 0) {
                // Берем максимальный ADM среди всех структур в системе
                const maxADM = Math.max(...systemStructures.map(s => s.vulnerability_occupancy_level || 0));
                const roundedADM = Math.round(maxADM * 10) / 10; // Округляем до 1 знака после запятой
                const status = maxADM >= 4 ? 'OK' : 'LOW';
                const statusIcon = maxADM >= 4 ? '✅' : '⚠️';

                postContent += `**${systemName}**: ADM ${roundedADM} ${statusIcon}\n`;

                if (maxADM < 4) {
                    warningSystems.push(`${systemName} (ADM ${roundedADM})`);
                }

                // Логирование в консоль
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

            // Управление сообщениями (как в предыдущей версии)
            if (config.sovereigntyMessageId) {
                try {
                    const messages = await channel.messages.fetch({ limit: 5 });
                    const ourMessageIndex = messages.findIndex(m => m.id === config.sovereigntyMessageId);

                    if (ourMessageIndex !== 0 || ourMessageIndex === -1) {
                        if (ourMessageIndex !== -1) {
                            await messages.get(config.sovereigntyMessageId)?.delete();
                            console.log('[CRON] ♻️ Deleted old sovereignty message');
                        }

                        const newMessage = await channel.send(postContent);
                        config.sovereigntyMessageId = newMessage.id;
                        console.log('[CRON] ✨ Created new sovereignty message');
                    } else {
                        const message = await channel.messages.fetch(config.sovereigntyMessageId);
                        await message.edit(postContent);
                        console.log('[CRON] 🔄 Updated existing sovereignty message');
                    }
                } catch (err) {
                    console.error('[CRON] ❌ Failed to manage messages:', err.message);
                    const newMessage = await channel.send(postContent);
                    config.sovereigntyMessageId = newMessage.id;
                    console.log('[CRON] ✨ Created new sovereignty message after error');
                }
            } else {
                const newMessage = await channel.send(postContent);
                config.sovereigntyMessageId = newMessage.id;
                console.log('[CRON] ✨ Created initial sovereignty message');
            }

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
        await runSovereigntyCheck(client);
    }, {
        timezone: 'Etc/UTC'
    });

    console.log('[CRON] ⏰ Scheduled ADM check every 30 minutes.');
}

module.exports = {
    startSovereigntyCheckCron,
    runSovereigntyCheck
};