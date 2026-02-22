// File: src/commands/help.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { injectable } from 'inversify';
import type Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('help')
    .setDescription('show help and available commands');

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('ISOBEL Help')
      .setDescription('Use these slash commands to control music, queue tracks, and configure your server.')
      .addFields(
        {
          name: 'Getting Started',
          value: '• `/play query:<song or URL>`\n• `/queue`\n• `/now-playing`\n• `/help`',
          inline: false,
        },
        {
          name: 'Playback',
          value: '• `/pause`, `/resume`, `/skip`, `/stop`\n• `/next`, `/replay`, `/unskip`\n• `/volume level:<0-100>`\n• `/disconnect`',
          inline: false,
        },
        {
          name: 'Queue Tools',
          value: '• `/move from:<n> to:<n>`\n• `/remove position:<n>` or `range:<a-b>`\n• `/shuffle`, `/loop`, `/loop-queue`\n• `/seek time:<m:ss>`, `/fseek time:<m:ss>`',
          inline: false,
        },
        {
          name: 'Library & Shortcuts',
          value: '• `/favorites create|use|list|remove`\n• `/yt query:<text>`\n• `/file file:<upload>`\n• `/playback-controls`',
          inline: false,
        },
        {
          name: 'Server Settings',
          value: '• `/config get`\n• `/config set-default-volume`\n• `/config set-default-queue-page-size`\n• `/config set-playlist-limit`\n• `/config set-leave-if-no-listeners`',
          inline: false,
        },
      )
      .setFooter({text: 'Web docs: https://isobelnet.de/#help'});

    await interaction.reply({embeds: [embed]});
  }
}
