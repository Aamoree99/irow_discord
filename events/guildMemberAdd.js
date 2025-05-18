const {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle
} = require('discord.js');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        const welcomeChannel = member.guild.channels.cache.get('1307342642421698631');
        if (!welcomeChannel) return;

        const embed = new EmbedBuilder()
            .setTitle('👋 Welcome!')
            .setDescription(`Hey <@${member.id}>, welcome to the server!\nIf you're interested in joining our EVE corp, click the button below to apply.`)
            .setColor(0x00b0f4);

        const joinButton = new ButtonBuilder()
            .setCustomId(`recruit_modal_${member.id}`)
            .setLabel('📝 Apply to Corp')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(joinButton);

        await welcomeChannel.send({
            content: `<@${member.id}>`,
            embeds: [embed],
            components: [row]
        });
    }
};
