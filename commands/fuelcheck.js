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

        console.log(`[FuelCheck] Command triggered by ${interaction.user.tag} (${interaction.user.id})`);
        console.log('[FuelCheck] Member roles:', interaction.member.roles.cache.map(r => r.id));

        if (!interaction.member.roles.cache.has(adminRoleId)) {
            console.warn('[FuelCheck] Permission denied.');
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        let config;
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('[FuelCheck] config.json loaded.');
        } catch (err) {
            console.error('❌ Failed to load config:', err);
            return interaction.editReply('❌ Could not read config.json.');
        }

        const channelId = config.fuelChannelId;
        console.log('[FuelCheck] fuelChannelId =', channelId);

        if (!channelId) {
            return interaction.editReply('❌ No fuelChannelId configured.');
        }

        try {
            const channel = await interaction.client.channels.fetch(channelId);
            console.log('[FuelCheck] Channel fetched:', channel?.name || 'Unknown');

            if (!channel || !channel.send) {
                throw new Error('Channel not found or not text-based');
            }

            await channel.send('✅ Fuel test successful. This message confirms bot access to this channel.');
            console.log('[FuelCheck] Test message sent.');
            await interaction.editReply('✅ Test message sent to fuel channel.');
        } catch (err) {
            console.error('❌ Failed to send test message:', err);
            await interaction.editReply('❌ Failed to send test message to fuel channel.');
        }
    }
};
