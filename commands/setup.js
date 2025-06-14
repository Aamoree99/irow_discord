const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure bot settings'),

    async execute(interaction) {
        const adminRoleId = process.env.ADMIN_ROLE_ID;

        if (!interaction.member.roles.cache.has(adminRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Загрузка конфигурации
        const configPath = path.join(__dirname, '../data/config.json');
        let config = {
            ticketChannelId: '',
            eventChannelId: '',
            fuelChannelId: '',
            eventCreatorRoleIds: []
        };

        if (fs.existsSync(configPath)) {
            const rawData = fs.readFileSync(configPath);
            config = JSON.parse(rawData);
        }

        // Подготовка модалки с текущими значениями
        const modal = new ModalBuilder()
            .setCustomId('setup_modal')
            .setTitle('Bot Setup');

        const eventChannelInput = new TextInputBuilder()
            .setCustomId('event_channel')
            .setLabel('Event Channel ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(config.eventChannelId || '');

        const ticketChannelInput = new TextInputBuilder()
            .setCustomId('ticket_channel')
            .setLabel('Ticket Channel ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(config.ticketChannelId || '');

        const fuelChannelInput = new TextInputBuilder() // Новый input
            .setCustomId('fuel_channel')
            .setLabel('Fuel Channel ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(config.fuelChannelId || '');

        const eventRolesInput = new TextInputBuilder()
            .setCustomId('event_roles')
            .setLabel('Creator Role IDs (comma separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue((config.eventCreatorRoleIds || []).join(','));

        const row1 = new ActionRowBuilder().addComponents(eventChannelInput);
        const row2 = new ActionRowBuilder().addComponents(ticketChannelInput);
        const row3 = new ActionRowBuilder().addComponents(fuelChannelInput); // Новый ряд
        const row4 = new ActionRowBuilder().addComponents(eventRolesInput);

        modal.addComponents(row1, row2, row3, row4); // Добавлен 4-й ряд

        await interaction.showModal(modal);
    }
};
