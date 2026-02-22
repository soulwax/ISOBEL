// File: src/commands/stop.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { type ChatInputCommandInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import type PlayerManager from '../managers/player.js';
import { TYPES } from '../types.js';
import type Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('stop playback, disconnect, and clear all songs in the queue');

  public requiresVC = true;

  private readonly playerManager: PlayerManager;

  constructor(@inject(TYPES.Managers.Player) playerManager: PlayerManager) {
    this.playerManager = playerManager;
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    const player = this.playerManager.get(interaction.guild!.id);

    // Stop playback and clear queue regardless of connection status
    // This allows stopping even if already disconnected
    player.stop();
    await interaction.reply('Stopped');
  }
}
