// File: src/commands/skip.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { type ChatInputCommandInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import type PlayerManager from '../managers/player.js';
import { actorFromInteraction } from '../services/playback-history.js';
import { TYPES } from '../types.js';
import { buildNowPlayingMessage } from '../utils/build-embed.js';
import type Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('skip the next songs')
    .addIntegerOption(option => option
      .setName('number')
      .setDescription('number of songs to skip [default: 1]')
      .setRequired(false));

  public requiresVC = true;

  private readonly playerManager: PlayerManager;

  constructor(@inject(TYPES.Managers.Player) playerManager: PlayerManager) {
    this.playerManager = playerManager;
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const numToSkip = interaction.options.getInteger('number') ?? 1;

    if (numToSkip < 1) {
      throw new Error('invalid number of songs to skip');
    }

    const player = this.playerManager.get(interaction.guild!.id);

    try {
      await player.forward(numToSkip, actorFromInteraction(interaction));
      await interaction.reply(player.getCurrent()
        ? buildNowPlayingMessage(player, {controls: false, note: 'keep \'er movin\''})
        : {content: 'keep \'er movin\''});
    } catch (error: unknown) {
      throw new Error('no song to skip to', {cause: error});
    }
  }
}
