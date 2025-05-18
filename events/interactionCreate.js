require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonStyle
} = require('discord.js');

const eventsPath = path.join(__dirname, '../data/events.json');
const configPath = path.join(__dirname, '../data/config.json');

const loadEvents = () => JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
const saveEvents = (data) => fs.writeFileSync(eventsPath, JSON.stringify(data, null, 2));

const ALLOWED_ROLE_IDS = [
    '1333132405875277956',
    '1307352531445350480',
    '1373686032582836365',
    process.env.ADMIN_ROLE_ID
];

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Error executing ${interaction.commandName}:`, error);
                const msg = { content: 'There was an error executing this command.', ephemeral: true };
                interaction.replied || interaction.deferred
                    ? await interaction.followUp(msg)
                    : await interaction.reply(msg);
            }
        }

        if (interaction.isButton()) {
            console.log(`[Button Click] customId = ${interaction.customId}`);

            const [action, type, userId, logMessageId] = interaction.customId.split('_');

            // === Ticket Close ===
            if (action === 'close' && type === 'ticket') {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                const isAllowed = ALLOWED_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
                if (!isAllowed)
                    return interaction.reply({
                        content: '❌ You do not have permission to close this ticket.',
                        ephemeral: true
                    });

                try {
                    const disabledButton = ButtonBuilder.from(interaction.component).setDisabled(true);
                    const row = new ActionRowBuilder().addComponents(disabledButton);

                    const originalEmbed = interaction.message.embeds?.[0];
                    const updatedEmbed = originalEmbed
                        ? EmbedBuilder.from(originalEmbed).setColor(0x555555).addFields({
                            name: '✅ Closed by',
                            value: `<@${interaction.user.id}>`,
                            inline: true
                        })
                        : null;

                    await interaction.update({
                        embeds: updatedEmbed ? [updatedEmbed] : [],
                        components: [row]
                    });

                    setTimeout(() => {
                        interaction.channel.delete().catch(err =>
                            console.error('❌ Failed to delete ticket channel:', err)
                        );
                    }, 5000);
                } catch (err) {
                    console.error('❌ Error closing ticket:', err);
                    await interaction.reply({
                        content: 'There was an error closing the ticket.',
                        ephemeral: true
                    });
                }
            }

            // === Recruit Modal Trigger ===
            if (action === 'recruit' && type === 'modal') {
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '❌ This button is not for you.', ephemeral: true });

                const modal = new ModalBuilder()
                    .setCustomId(`recruit_submit_${interaction.user.id}`)
                    .setTitle('Corp Application')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('char_name')
                                .setLabel('Character Name')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('time_in_eve')
                                .setLabel('Time in EVE')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('activities')
                                .setLabel('Preferred Activities')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('how_found')
                                .setLabel('How did you find us?')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                        )
                    );

                try {
                    return await interaction.showModal(modal);
                } catch (err) {
                    console.error('❌ Failed to show modal:', err);
                    return interaction.reply({ content: '⚠️ Could not open form.', ephemeral: true });
                }

            }

            if (interaction.customId === 'create_ticket') {
                const user = interaction.user;
                const existingChannels = await interaction.guild.channels.fetch();
                const userNameSlug = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                let counter = 1;
                let channelName;

                do {
                    channelName = `ticket-${userNameSlug}-${counter}`;
                    counter++;
                } while (existingChannels.some(c => c.name === channelName));

                const categoryId = interaction.channel.parentId ?? null;

                const permissionOverwrites = [
                    {
                        id: interaction.guild.roles.everyone,
                        deny: ['ViewChannel']
                    },
                    {
                        id: user.id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                    },
                    ...ALLOWED_ROLE_IDS.map(id => ({
                        id,
                        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                    }))
                ];

                const privateChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: 0,
                    parent: categoryId,
                    permissionOverwrites
                });

                const closeButton = new ButtonBuilder()
                    .setCustomId(`close_ticket_${user.id}`)
                    .setLabel('🗑️ Close Ticket')
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder().addComponents(closeButton);

                const embed = new EmbedBuilder()
                    .setTitle('🎫 Reprocessing Ticket')
                    .setDescription(`<@${user.id}>`)
                    .setColor(0x00b0f4);

                await privateChannel.send({ embeds: [embed], components: [row] });

                await privateChannel.send({
                    content: `Your reprocessing request will be taken care of by one of the reprocessors in the corp.\nPlease provide a <https://janice.e-351.com/> link with your ore's and you will be messaged here on who to contract it to shortly!\n\n**ALL ORES MUST BE CONTRACTED IN THE PYY3-5 REFINERY!**`
                });

                await interaction.reply({
                    content: `✅ Your ticket has been created: ${privateChannel}`,
                    ephemeral: true
                });
            }

            // === Recruit Channel Close ===
            if (action === 'recruit' && type === 'close') {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                const hasAccess = ALLOWED_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
                if (!hasAccess)
                    return interaction.reply({ content: '❌ You do not have permission to close this channel.', ephemeral: true });

                const disabledButton = ButtonBuilder.from(interaction.component).setDisabled(true);
                const row = new ActionRowBuilder().addComponents(disabledButton);
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x555555)
                    .addFields({ name: '✅ Closed by', value: `<@${interaction.user.id}>`, inline: true });

                await interaction.update({ embeds: [updatedEmbed], components: [row] });

                setTimeout(() => {
                    interaction.channel.delete().catch(err => console.error('❌ Failed to delete recruitment channel:', err));
                }, 5000);
            }

            // === Event RSVP Join/Leave ===
            if (interaction.customId === 'event_join' || interaction.customId === 'event_leave') {
                try {
                    const events = loadEvents();
                    const event = events.find(e => e.messageId === interaction.message.id);
                    if (!event) return interaction.reply({ content: '⚠️ Event not found.', ephemeral: true });

                    event.attendees = event.attendees || [];
                    event.declined = event.declined || [];
                    const userId = interaction.user.id;

                    if (interaction.customId === 'event_join') {
                        if (event.attendees.includes(userId)) {
                            return interaction.reply({ content: '✅ You are already signed up.', ephemeral: true });
                        }

                        event.attendees.push(userId);
                        event.declined = event.declined.filter(id => id !== userId);
                        saveEvents(events);
                        await updateEventMessage(interaction, event);
                        return interaction.reply({ content: '🎉 You joined the event!', ephemeral: true });
                    }

                    if (interaction.customId === 'event_leave') {
                        if (event.declined.includes(userId)) {
                            return interaction.reply({ content: '❌ You already declined.', ephemeral: true });
                        }

                        event.declined.push(userId);
                        event.attendees = event.attendees.filter(id => id !== userId);
                        saveEvents(events);
                        await updateEventMessage(interaction, event);
                        return interaction.reply({ content: '👋 You declined the event.', ephemeral: true });
                    }
                } catch (error) {
                    console.error('❌ Error handling RSVP:', error);
                    await interaction.reply({ content: 'There was an error updating your RSVP.', ephemeral: true });
                }
            }
        }

        // === Modal Submission (Recruit Application) ===
        if (interaction.isModalSubmit()) {
            const [action, type, userId] = interaction.customId.split('_');
            if (action === 'recruit' && type === 'submit') {
                if (interaction.user.id !== userId)
                    return interaction.reply({ content: '❌ This form is not for you.', ephemeral: true });

                const charName = interaction.fields.getTextInputValue('char_name');
                const timeInEve = interaction.fields.getTextInputValue('time_in_eve');
                const activities = interaction.fields.getTextInputValue('activities');
                const howFound = interaction.fields.getTextInputValue('how_found');

                const userNameSlug = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                const channelName = `recruit-${userNameSlug}`;

                let recruitChannel = interaction.guild.channels.cache.find(c => c.name === channelName);

                if (!recruitChannel) {
                    const permissionOverwrites = [
                        {
                            id: interaction.guild.roles.everyone,
                            deny: ['ViewChannel']
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                        },
                        ...ALLOWED_ROLE_IDS.map(id => ({
                            id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                        }))
                    ];

                    recruitChannel = await interaction.guild.channels.create({
                        name: channelName,
                        type: 0,
                        parent: null,
                        permissionOverwrites
                    });
                }

                const formEmbed = new EmbedBuilder()
                    .setTitle('📝 Corp Application')
                    .setDescription(`New applicant: <@${interaction.user.id}>`)
                    .addFields(
                        { name: 'Character Name', value: charName, inline: true },
                        { name: 'Time in EVE', value: timeInEve, inline: true },
                        { name: 'Preferred Activities', value: activities },
                        { name: 'How did you find us?', value: howFound }
                    )
                    .setColor(0x00b0f4);

                const closeButton = new ButtonBuilder()
                    .setCustomId(`recruit_close_${recruitChannel.id}`)
                    .setLabel('🗑️ Close')
                    .setStyle('Danger');

                const row = new ActionRowBuilder().addComponents(closeButton);

                await recruitChannel.send({
                    content: `<@${interaction.user.id}>`,
                    embeds: [formEmbed],
                    components: [row]
                });

                await interaction.reply({ content: '✅ Your application has been submitted and a channel was created.', ephemeral: true });
            }
        }

    }
};

async function updateEventMessage(interaction, event) {
    try {
        const channel = await interaction.guild.channels.fetch(event.channelId);
        const message = await channel.messages.fetch(event.messageId);
        const embed = EmbedBuilder.from(message.embeds[0]);

        embed.spliceFields(-2, 2);
        embed.addFields(
            {
                name: '🟢 Attending',
                value: event.attendees.length
                    ? event.attendees.map(id => `<@${id}>`).join('\n')
                    : '*No one yet*',
                inline: false
            },
            {
                name: '🔴 Declined',
                value: event.declined.length
                    ? event.declined.map(id => `<@${id}>`).join('\n')
                    : '*No one yet*',
                inline: false
            }
        );

        await message.edit({ embeds: [embed] });
    } catch (err) {
        console.error('❌ Failed to update RSVP embed:', err);
    }
}
