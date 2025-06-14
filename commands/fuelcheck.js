const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fuelcheck')
        .setDescription('Manually check fuel levels in stations'),

    async execute(interaction) {
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        if (!interaction.member.roles.cache.has(adminRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        // Загрузка конфигурации
        let config;
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (err) {
            console.error('❌ Failed to load config:', err);
            return interaction.editReply('❌ Could not read config.json.');
        }

        const channelId = config.fuelChannelId;

        if (!channelId) {
            return interaction.editReply('❌ No fuelChannelId configured.');
        }

        try {
            const channel = await interaction.client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            await channel.send('✅ Fuel test successful. This message confirms bot access to this channel.');
            await interaction.editReply('✅ Test message sent to fuel channel.');
        } catch (err) {
            console.error('❌ Failed to send test message:', err);
            await interaction.editReply('❌ Failed to send test message to fuel channel.');
        }
    }
};
