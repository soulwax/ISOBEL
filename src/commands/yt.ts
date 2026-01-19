// File: src/commands/yt.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import AddQueryToQueue from '../services/add-query-to-queue.js';
import GetSongs from '../services/get-songs.js';
import { TYPES } from '../types.js';
import Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('yt')
    .setDescription('play a YouTube link or search term via yt-dlp')
    .addStringOption(option => option
      .setName('query')
      .setDescription('YouTube URL or search term')
      .setRequired(true));

  public requiresVC = true;

  private readonly addQueryToQueue: AddQueryToQueue;
  private readonly getSongs: GetSongs;

  constructor(
    @inject(TYPES.Services.AddQueryToQueue) addQueryToQueue: AddQueryToQueue,
    @inject(TYPES.Services.GetSongs) getSongs: GetSongs
  ) {
    this.addQueryToQueue = addQueryToQueue;
    this.getSongs = getSongs;
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const query = interaction.options.getString('query')!.trim();
    const song = await this.getSongs.getYouTubeSong(query);

    await this.addQueryToQueue.addToQueue({
      interaction,
      query,
      songsOverride: [song],
      extraMsgOverride: 'via yt-dlp',
      addToFrontOfQueue: false,
      shuffleAdditions: false,
      shouldSplitChapters: false,
      skipCurrentTrack: false,
    });
  }
}
