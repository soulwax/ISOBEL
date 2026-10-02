// File: src/commands/play.ts

import { SlashCommandBuilder, type SlashCommandOptionsOnlyBuilder, type SlashCommandSubcommandsOnlyBuilder } from '@discordjs/builders';
import { type APIApplicationCommandOptionChoice } from 'discord-api-types/v10';
import { type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from 'discord.js';
import { inject, injectable } from 'inversify';
import { URL } from 'url';
import type PlayerManager from '../managers/player.js';
import type AddQueryToQueue from '../services/add-query-to-queue.js';
import type PlaybackHistory from '../services/playback-history.js';
import type StarchildAPI from '../services/starchild-api.js';
import { TYPES } from '../types.js';
import { getMemberVoiceChannel } from '../utils/channels.js';
import { prisma } from '../utils/db.js';
import debug from '../utils/debug.js';
import errorMsg from '../utils/error-msg.js';
import getStarchildSuggestionsFor from '../utils/get-starchild-suggestions-for.js';
import { truncate } from '../utils/string.js';
import { prettyTime } from '../utils/time.js';
import type Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder) & Pick<SlashCommandBuilder, 'toJSON'>;

  public requiresVC = true;

  public readonly handledButtonIds = ['play:bump', 'play:undo'] as const;

  private readonly addQueryToQueue: AddQueryToQueue;
  private readonly starchildAPI: StarchildAPI;
  private readonly history: PlaybackHistory;
  private readonly playerManager: PlayerManager;

  constructor(
    @inject(TYPES.Services.AddQueryToQueue) addQueryToQueue: AddQueryToQueue,
    @inject(TYPES.Services.StarchildAPI) starchildAPI: StarchildAPI,
    @inject(TYPES.Services.PlaybackHistory) history: PlaybackHistory,
    @inject(TYPES.Managers.Player) playerManager: PlayerManager,
  ) {
    this.addQueryToQueue = addQueryToQueue;
    this.starchildAPI = starchildAPI;
    this.history = history;
    this.playerManager = playerManager;

    this.slashCommand = new SlashCommandBuilder()
      .setName('play')
      .setDescription('play a song')
      .addStringOption(option => option
        .setName('query')
        .setDescription('search query or HLS stream URL')
        .setAutocomplete(true)
        .setRequired(true))
      .addBooleanOption(option => option
        .setName('immediate')
        .setDescription('add track to the front of the queue'))
      .addBooleanOption(option => option
        .setName('shuffle')
        .setDescription('shuffle the input if you\'re adding multiple tracks'))
      .addBooleanOption(option => option
        .setName('skip')
        .setDescription('skip the currently playing track'));
  }

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const query = interaction.options.getString('query')!.trim();

    await this.addQueryToQueue.addToQueue({
      interaction,
      query,
      addToFrontOfQueue: interaction.options.getBoolean('immediate') ?? false,
      shuffleAdditions: interaction.options.getBoolean('shuffle') ?? false,
      shouldSplitChapters: false,
      skipCurrentTrack: interaction.options.getBoolean('skip') ?? false,
    });
  }

  public async handleAutocompleteInteraction(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const query = interaction.options.getString('query')?.trim() ?? '';

      // Smart zero-input discovery: when query is empty, suggest server favorites and recent plays
      if (query.length === 0) {
        const suggestions = await this.getEmptyQuerySuggestions(interaction);
        await interaction.respond(suggestions);
        return;
      }

      // Don't return suggestions for URLs
      if (URL.canParse(query)) {
        await interaction.respond([]);
        return;
      }

      // Race autocomplete search against a 2.2-second timeout guard so Discord's 3-second deadline is never missed
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Autocomplete search timed out')), 2200);
      });

      const searchPromise = getStarchildSuggestionsFor(query, this.starchildAPI, 10);
      const suggestions = await Promise.race([searchPromise, timeoutPromise]);

      await interaction.respond(suggestions);
    } catch (error: unknown) {
      debug('Autocomplete interaction error:', error);
      try {
        if (!interaction.responded) {
          await interaction.respond([]);
        }
      } catch {
        // Ignored
      }
    }
  }

  private async getEmptyQuerySuggestions(interaction: AutocompleteInteraction): Promise<APIApplicationCommandOptionChoice[]> {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return [];
    }

    const suggestions: APIApplicationCommandOptionChoice[] = [];

    try {
      // 1. Guild Favorites (up to 4)
      const favorites = await prisma.favoriteQuery.findMany({
        where: {guildId},
        orderBy: {updatedAt: 'desc'},
        take: 4,
        select: {name: true, query: true},
      });

      for (const fav of favorites) {
        suggestions.push({
          name: truncate(`⭐ [Fav] ${fav.name} (${fav.query})`, 100),
          value: fav.query,
        });
      }

      // 2. Recent Plays (up to 6)
      const recentPlays = await this.history.getRecentPlays(guildId, 6);
      for (const play of recentPlays) {
        const durationBadge = play.lengthSeconds > 0 ? ` [${prettyTime(play.lengthSeconds)}]` : '';
        const titleArtist = `🕒 [Recent] ${play.title} - ${play.artist}`;
        const availableLength = Math.max(10, 100 - durationBadge.length);
        const name = `${truncate(titleArtist, availableLength)}${durationBadge}`;
        const value = play.source === 'Starchild' && play.url
          ? `track:${play.url}`
          : `${play.title} ${play.artist}`;

        suggestions.push({
          name,
          value,
        });
      }
    } catch (error) {
      debug('Failed to build empty query suggestions:', error);
    }

    return suggestions.slice(0, 10);
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      return;
    }

    const memberChannel = getMemberVoiceChannel(interaction.member as GuildMember);
    if (!memberChannel) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    const player = this.playerManager.get(interaction.guild.id);
    const customId = interaction.customId;

    if (customId.startsWith('play:bump:')) {
      const trackUrl = customId.slice('play:bump:'.length);
      const upcoming = player.getQueue();
      const index = upcoming.findIndex(s => s.url === trackUrl);

      if (index === -1) {
        await interaction.reply({content: errorMsg('Song is no longer in the upcoming queue'), flags: MessageFlags.Ephemeral});
        return;
      }

      const fromPosition = index + 1;
      if (fromPosition === 1) {
        await interaction.reply({content: 'Song is already next in the queue!', flags: MessageFlags.Ephemeral});
        return;
      }

      const movedSong = player.move(fromPosition, 1);
      await interaction.reply({
        content: `⚡ **${movedSong.title} - ${movedSong.artist}** was moved to the front of the queue!`,
      });
      return;
    }

    if (customId.startsWith('play:undo:')) {
      const trackUrl = customId.slice('play:undo:'.length);
      const upcoming = player.getQueue();
      const index = upcoming.findIndex(s => s.url === trackUrl);

      if (index === -1) {
        await interaction.reply({content: errorMsg('Song is no longer in the queue'), flags: MessageFlags.Ephemeral});
        return;
      }

      const songToRemove = upcoming[index];
      player.removeFromQueue(index + 1, 1);
      await interaction.reply({
        content: `🗑️ **${songToRemove.title} - ${songToRemove.artist}** was removed from the queue.`,
      });
      return;
    }
  }
}
