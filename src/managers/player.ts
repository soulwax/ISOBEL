// File: src/managers/player.ts

import { inject, injectable } from 'inversify';
import type FileCacheProvider from '../services/file-cache.js';
import Player from '../services/player.js';
import type SongbirdNext from '../services/songbird-next.js';
import type StarchildAPI from '../services/starchild-api.js';
import { TYPES } from '../types.js';

@injectable()
export default class PlayerManager {
  private readonly guildPlayers: Map<string, Player>;
  private readonly fileCache: FileCacheProvider;
  private readonly starchildAPI: StarchildAPI;
  private readonly songbirdNext: SongbirdNext;

  constructor(
    @inject(TYPES.FileCache) fileCache: FileCacheProvider,
    @inject(TYPES.Services.StarchildAPI) starchildAPI: StarchildAPI,
    @inject(TYPES.Services.SongbirdNext) songbirdNext: SongbirdNext
  ) {
    this.guildPlayers = new Map();
    this.fileCache = fileCache;
    this.starchildAPI = starchildAPI;
    this.songbirdNext = songbirdNext;
  }

  get(guildId: string): Player {
    let player = this.guildPlayers.get(guildId);

    if (!player) {
      player = new Player(this.fileCache, guildId, this.starchildAPI, this.songbirdNext);

      this.guildPlayers.set(guildId, player);
    }

    return player;
  }

  /**
   * Removes and disconnects a player for a guild
   * Should be called when the bot leaves a guild to prevent memory leaks
   */
  remove(guildId: string): void {
    const player = this.guildPlayers.get(guildId);
    if (player) {
      player.disconnect();
      this.guildPlayers.delete(guildId);
    }
  }
}
