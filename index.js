require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// === Инициализация клиента ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

client.commands = new Collection();

// === Пути к папкам ===
const commandsPath = path.join(__dirname, './commands');
const eventsPath = path.join(__dirname, './events');
const eventsDataPath = path.join(__dirname, './data/events.json');

// === Загрузка команд ===
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const allCommands = [];

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    allCommands.push(command.data.toJSON());
}

// === Подключение событий ===
fs.readdirSync(eventsPath)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
        const event = require(path.join(eventsPath, file));
        client.on(event.name, (...args) => event.execute(...args, client));
    });

// === Регистрация команд ===
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('📡 Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: allCommands }
        );
        console.log('✅ Slash commands registered.');
    } catch (err) {
        console.error('❌ Failed to register commands:', err);
    }
}

// === Восстановление таймеров для ивентов ===
async function restoreEventTimers() {
    try {
        if (!fs.existsSync(eventsDataPath)) return;

        const raw = fs.readFileSync(eventsDataPath, 'utf8');
        const allEvents = JSON.parse(raw);

        for (const event of allEvents) {
            const delay = event.eventTime - Date.now();
            if (delay <= 0 || !event.attendees || event.attendees.length === 0) continue;

            setTimeout(async () => {
                try {
                    const guild = client.guilds.cache.get(process.env.GUILD_ID);
                    if (!guild) return;

                    const channel = await guild.channels.fetch(event.channelId);
                    const pingList = event.attendees.map(id => `<@${id}>`).join(', ');
                    await channel.send(`🚀 Event **${event.title}** is starting now!\n👥 ${pingList}`);
                } catch (err) {
                    console.error(`❌ Failed to send event start message:`, err);
                }
            }, delay);
        }

        console.log(`🔁 Event timers restored (${allEvents.length} total).`);
    } catch (err) {
        console.error(`❌ Error reading events.json:`, err);
    }
}

async function ensureTicketButtonMessage() {
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return;

        const config = JSON.parse(fs.readFileSync(path.join(__dirname, './data/config.json'), 'utf8'));
        const ticketChannel = await guild.channels.fetch(config.ticketChannelId);

        if (!ticketChannel) {
            console.warn('⚠️ TICKET_CHANNEL_ID is invalid or missing.');
            return;
        }

        const messages = await ticketChannel.messages.fetch({ limit: 10 });
        const alreadyExists = messages.some(msg =>
            msg.author.id === client.user.id &&
            msg.components.length &&
            msg.components[0].components.some(c => c.customId === 'create_ticket')
        );

        if (alreadyExists) {
            console.log('✅ Ticket creation message already exists.');
            return;
        }

        const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

        const embed = new EmbedBuilder()
            .setTitle('📨 Ticket System')
            .setDescription('Click the button below to create a private ticket for reprocessing.')
            .setColor(0x00b0f4);

        const button = new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('📝 Create Ticket')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await ticketChannel.send({ embeds: [embed], components: [row] });
        console.log('✅ Sent new ticket creation message.');
    } catch (err) {
        console.error('❌ Failed to ensure ticket creation message:', err);
    }
}


// === Запуск ===
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: 'helping Dario', type: 0 }], // type 0 = Playing
        status: 'online'
    });


    if (process.env.REGISTER_COMMANDS === 'true') {
        await registerCommands();
    }

    await ensureTicketButtonMessage();
    await restoreEventTimers();
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Failed to login:', err);
});
