// File: src/commands/file.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import AddQueryToQueue from '../services/add-query-to-queue.js';
import { TYPES } from '../types.js';
import Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('file')
    .setDescription('play an attached mp3')
    .addAttachmentOption(option => option
      .setName('file')
      .setDescription('attach an mp3 to play directly')
      .setRequired(true))
    .addBooleanOption(option => option
      .setName('immediate')
      .setDescription('add track to the front of the queue'))
    .addBooleanOption(option => option
      .setName('skip')
      .setDescription('skip the currently playing track'));

  public requiresVC = true;

  private readonly addQueryToQueue: AddQueryToQueue;

  constructor(@inject(TYPES.Services.AddQueryToQueue) addQueryToQueue: AddQueryToQueue) {
    this.addQueryToQueue = addQueryToQueue;
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const attachment = interaction.options.getAttachment('file', true);

    await this.addQueryToQueue.addToQueue({
      interaction,
      attachment,
      addToFrontOfQueue: interaction.options.getBoolean('immediate') ?? false,
      shuffleAdditions: false,
      shouldSplitChapters: false,
      skipCurrentTrack: interaction.options.getBoolean('skip') ?? false,
    });
  }
}
