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
        console.log(`[CRON] 📊 Retrieved sovereignty data for ${sovereigntyData.length} systems.`);

        let postContent = "**System Sovereignty Status**\n\n";
        let warningSystems = [];
        let updatedSystems = [];

        config.systems.forEach(system => {
            const sovInfo = sovereigntyData.find(item => item.system_id === system.id);
            const systemName = system.name || `System ID: ${system.id}`;

            if (sovInfo) {
                const vulnerabilityLevel = sovInfo.vulnerability_occupancy_level || 0;
                const status = vulnerabilityLevel >= 4 ? '✅' : '⚠️ ATTENTION';

                postContent += `**${systemName}**: Level ${vulnerabilityLevel} ${status}\n`;

                if (vulnerabilityLevel < 4) {
                    warningSystems.push(systemName);
                }

                updatedSystems.push({
                    id: system.id,
                    name: systemName,
                    vulnerability_level: vulnerabilityLevel,
                    last_checked: new Date().toISOString()
                });
            } else {
                postContent += `**${systemName}**: No sovereignty data\n`;
                updatedSystems.push({
                    id: system.id,
                    name: systemName,
                    vulnerability_level: null,
                    last_checked: new Date().toISOString()
                });
            }
        });

        if (warningSystems.length > 0) {
            postContent += `\n🚨 **Warning!** The following systems have low sovereignty: ${warningSystems.join(', ')}`;
        }

        // Update system data in config
        config.systems = updatedSystems;

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) {
                console.warn('[CRON] ⚠️ Channel not found.');
                return;
            }

            // Проверяем, есть ли уже сообщение в конфиге
            if (config.sovereigntyMessageId) {
                try {
                    // Проверяем, есть ли сообщения после нашего
                    const messages = await channel.messages.fetch({ limit: 5 });
                    const ourMessageIndex = messages.findIndex(m => m.id === config.sovereigntyMessageId);

                    // Если наше сообщение не последнее или не найдено
                    if (ourMessageIndex !== 0 || ourMessageIndex === -1) {
                        // Удаляем старое сообщение, если найдено
                        if (ourMessageIndex !== -1) {
                            await messages.get(config.sovereigntyMessageId)?.delete();
                            console.log('[CRON] ♻️ Deleted old sovereignty message');
                        }

                        // Создаем новое сообщение
                        const newMessage = await channel.send(postContent);
                        config.sovereigntyMessageId = newMessage.id;
                        console.log('[CRON] ✨ Created new sovereignty message');
                    } else {
                        // Редактируем существующее сообщение
                        const message = await channel.messages.fetch(config.sovereigntyMessageId);
                        await message.edit(postContent);
                        console.log('[CRON] 🔄 Updated existing sovereignty message');
                    }
                } catch (err) {
                    console.error('[CRON] ❌ Failed to manage messages:', err.message);
                    // Если ошибка при работе с сообщением, создаем новое
                    const newMessage = await channel.send(postContent);
                    config.sovereigntyMessageId = newMessage.id;
                    console.log('[CRON] ✨ Created new sovereignty message after error');
                }
            } else {
                // Если нет сохраненного ID сообщения, создаем новое
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
    // Schedule: Every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        await runSovereigntyCheck(client);
    }, {
        timezone: 'Etc/UTC'
    });

    console.log('[CRON] ⏰ Scheduled sovereignty check every 30 minutes.');
}

module.exports = {
    startSovereigntyCheckCron,
    runSovereigntyCheck
};