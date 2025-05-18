const {
    SlashCommandBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/config.json');
const eventsPath = path.join(__dirname, '../data/events.json');

if (!fs.existsSync(eventsPath)) {
    fs.writeFileSync(eventsPath, JSON.stringify([]));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-event')
        .setDescription('Create a new event')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Event title')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Event description')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('datetime')
                .setDescription('Event time (UTC), format: YYYY-MM-DD HH:mm')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('ping_role')
                .setDescription('Role to ping when event starts')
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Config check
        if (!config.eventChannelId || !config.ticketChannelId || !config.eventCreatorRoleIds) {
            return interaction.reply({ content: '⚠️ Bot is not fully configured. Use /setup first.', ephemeral: true });
        }

        // Role check
        const hasPermission = config.eventCreatorRoleIds.some(roleId =>
            interaction.member.roles.cache.has(roleId)
        );

        if (!hasPermission) {
            return interaction.reply({ content: '⛔ You are not allowed to create events.', ephemeral: true });
        }

        // Input
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const datetimeStr = interaction.options.getString('datetime');
        const pingRole = interaction.options.getRole('ping_role');

        // Time parsing
        const datetime = new Date(`${datetimeStr}:00Z`);
        if (isNaN(datetime.getTime())) {
            return interaction.reply({ content: '❌ Invalid datetime format. Use: YYYY-MM-DD HH:mm (UTC)', ephemeral: true });
        }

        // Embed formatting
        const timestamp = Math.floor(datetime.getTime() / 1000);
        const utcString = datetime.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

        const embed = new EmbedBuilder()
            .setTitle(`📅 ${title}`)
            .setDescription(description)
            .addFields(
                { name: '🕒 Time (EVE/UTC)', value: `\`${utcString}\``, inline: true },
                { name: '🌍 Your Local Time', value: `<t:${timestamp}:F>`, inline: true },
                { name: '🟢 Attending', value: '*No one yet*', inline: false },
                { name: '🔴 Declined', value: '*No one yet*', inline: false }
            )
            .setFooter({ text: 'Click a button to RSVP' })
            .setColor(0x2b2d31);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('event_join').setLabel('✅ Join').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('event_leave').setLabel('❌ Decline').setStyle(ButtonStyle.Danger)
        );

        // Send embed
        const channel = await interaction.guild.channels.fetch(config.eventChannelId);
        const message = await channel.send({
            content: pingRole ? `${pingRole}` : null,
            embeds: [embed],
            components: [buttons]
        });

        // Save event data
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        allEvents.push({
            messageId: message.id,
            channelId: channel.id,
            eventTime: datetime.getTime(),
            title,
            attendees: [],
            declined: [],
            creatorId: userId
        });
        fs.writeFileSync(eventsPath, JSON.stringify(allEvents, null, 2));

        await interaction.reply({ content: '✅ Event created!', ephemeral: true });

        // Schedule ping and disable buttons
        const delay = datetime.getTime() - Date.now();
        if (delay > 0) {
            setTimeout(async () => {
                const updated = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
                const event = updated.find(e => e.messageId === message.id);
                if (!event || event.attendees.length === 0) return;

                try {
                    const pingList = event.attendees.map(id => `<@${id}>`).join(', ');
                    const fetchedMessage = await channel.messages.fetch(event.messageId);

                    if (fetchedMessage) {
                        await fetchedMessage.edit({ components: [] });
                        await channel.send(`🚀 Event **${event.title}** is starting now!\n👥 ${pingList}`);
                    }
                } catch (err) {
                    console.error('❌ Failed to send start message or disable buttons:', err);
                }
            }, delay);
        }
    }
};
