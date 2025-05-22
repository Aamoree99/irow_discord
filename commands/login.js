const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const AUTHORIZED_USER_ID = '179905495186800641';
const configPath = path.join(__dirname, '../data/config.json');
const AUTH_URL_BASE = 'http://localhost:3000/login?discord_id=';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Authorize with EVE Online'),

    async execute(interaction) {
        const userId = interaction.user.id;

        // Restrict to specific user
        if (userId !== AUTHORIZED_USER_ID) {
            return interaction.reply({
                content: '❌ You are not allowed to use this command.',
                ephemeral: true
            });
        }

        const loginUrl = `${AUTH_URL_BASE}${userId}`;

        // Step 1: Send auth link
        await interaction.reply({
            content: `🔐 Please authorize with EVE Online: ${loginUrl}\n\nI'll notify you once authorization is confirmed.`,
            ephemeral: true
        });

        // Step 2: Wait and check config.json for tokens
        const checkInterval = 3000; // ms
        const maxWaitTime = 60000; // 1 min

        const waitForAuth = async () => {
            const startTime = Date.now();

            return new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (Date.now() - startTime > maxWaitTime) {
                        clearInterval(interval);
                        return resolve(false);
                    }

                    if (!fs.existsSync(configPath)) return;

                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

                    if (config.tokens && config.tokens[userId]) {
                        clearInterval(interval);
                        return resolve(true);
                    }
                }, checkInterval);
            });
        };

        const authorized = await waitForAuth();

        if (authorized) {
            await interaction.followUp({
                content: '✅ Successfully authorized with EVE Online!',
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: '⚠️ Authorization timeout. Please try again.',
                ephemeral: true
            });
        }
    }
};
