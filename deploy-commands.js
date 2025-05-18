require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// === Загружаем все команды ===
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.warn(`⚠️ The command at ${file} is missing "data" or "execute"`);
    }
}

// === Discord REST client ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// === Регистрируем команды ===
(async () => {
    try {
        console.log('📡 Registering slash commands...');
        console.log(`📦 Commands:`, commands.map(c => c.name).join(', '));

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
})();
