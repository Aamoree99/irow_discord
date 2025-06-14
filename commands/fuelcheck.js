const { SlashCommandBuilder } = require('discord.js');
const runFuelCheck = require('../cron/checkStations').runFuelCheck;

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

        try {
            await runFuelCheck(interaction.client);
            await interaction.editReply('✅ Fuel check completed.');
        } catch (err) {
            console.error('❌ /fuelcheck error:', err);
            await interaction.editReply('❌ Failed to check fuel. Check logs for details.');
        }
    }
};
