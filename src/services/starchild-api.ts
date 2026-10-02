// File: src/services/starchild-api.ts

import got, { type Got } from 'got';
import { inject, injectable } from 'inversify';
import pRetry from 'p-retry';
import { TYPES } from '../types.js';
import { ONE_HOUR_IN_SECONDS } from '../utils/constants.js';
import debug from '../utils/debug.js';
import { formatError } from '../utils/error-msg.js';
import type Config from './config.js';
import type KeyValueCacheProvider from './key-value-cache.js';
import { MediaSource, type SongMetadata } from './player.js';

interface DeezerSearchResult {
  id: number;
  title: string;
  title_short: string;
  duration: number;
  artist: {
    id: number;
    name: string;
  };
  album: {
    id: number;
    title: string;
    cover: string;
    cover_medium: string;
    cover_big: string;
  };
  preview?: string;
  link: string;
}

interface DeezerSearchResponse {
  data: DeezerSearchResult[];
  total: number;
  next?: string;
}

@injectable()
export default class StarchildAPI {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly httpClient: Got;
  private static readonly defaultBaseUrl = 'https://api.starchildmusic.com';

  private readonly memorySearchCache = new Map<string, {data: SongMetadata[]; expiresAt: number}>();
  private readonly memoryTrackCache = new Map<string, {song: SongMetadata; expiresAt: number}>();
  private readonly inFlightSearches = new Map<string, Promise<SongMetadata[]>>();

  private static readonly MEMORY_SEARCH_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly MEMORY_TRACK_TTL_MS = 20 * 60 * 1000; // 20 minutes
  private static readonly MAX_SEARCH_CACHE_SIZE = 500;
  private static readonly MAX_TRACK_CACHE_SIZE = 2000;

  constructor(@inject(TYPES.Config) config: Config, @inject(TYPES.KeyValueCache) private readonly cache: KeyValueCacheProvider) {
    this.apiKey = config.SONGBIRD_API_KEY;
    const configuredBaseUrl = config.SONGBIRD_BASE_URL.trim();
    const baseUrl = configuredBaseUrl === '' ? StarchildAPI.defaultBaseUrl : configuredBaseUrl;
    this.baseUrl = baseUrl.replace(/\/+$/, '');

    this.httpClient = got.extend({
      prefixUrl: `${this.baseUrl}/`,
      headers: {
        'X-API-Key': this.apiKey,
      },
      timeout: {
        request: 30000,
      },
    });
  }

  private pruneExpiredCache(): void {
    const now = Date.now();
    if (this.memorySearchCache.size > StarchildAPI.MAX_SEARCH_CACHE_SIZE) {
      for (const [key, val] of this.memorySearchCache.entries()) {
        if (val.expiresAt < now) {
          this.memorySearchCache.delete(key);
        }
      }
      if (this.memorySearchCache.size > StarchildAPI.MAX_SEARCH_CACHE_SIZE) {
        const excess = this.memorySearchCache.size - StarchildAPI.MAX_SEARCH_CACHE_SIZE;
        let count = 0;
        for (const key of this.memorySearchCache.keys()) {
          if (count++ >= excess) {
            break;
          }
          this.memorySearchCache.delete(key);
        }
      }
    }

    if (this.memoryTrackCache.size > StarchildAPI.MAX_TRACK_CACHE_SIZE) {
      for (const [key, val] of this.memoryTrackCache.entries()) {
        if (val.expiresAt < now) {
          this.memoryTrackCache.delete(key);
        }
      }
      if (this.memoryTrackCache.size > StarchildAPI.MAX_TRACK_CACHE_SIZE) {
        const excess = this.memoryTrackCache.size - StarchildAPI.MAX_TRACK_CACHE_SIZE;
        let count = 0;
        for (const key of this.memoryTrackCache.keys()) {
          if (count++ >= excess) {
            break;
          }
          this.memoryTrackCache.delete(key);
        }
      }
    }
  }

  public getTrackFromMemory(trackId: string): SongMetadata | null {
    const cached = this.memoryTrackCache.get(trackId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.song;
    }
    return null;
  }

  public cacheTrack(song: SongMetadata): void {
    this.pruneExpiredCache();
    this.memoryTrackCache.set(song.url, {
      song,
      expiresAt: Date.now() + StarchildAPI.MEMORY_TRACK_TTL_MS,
    });
  }

  async getTrackById(trackId: string): Promise<SongMetadata | null> {
    const inMemory = this.getTrackFromMemory(trackId);
    if (inMemory) {
      return inMemory;
    }

    try {
      const response = await this.httpClient.get<DeezerSearchResult[]>('music/tracks/batch', {
        searchParams: {
          ids: trackId,
          key: this.apiKey,
        },
        timeout: {
          request: 5000,
        },
      }).json<DeezerSearchResult[]>();

      if (Array.isArray(response) && response.length > 0) {
        const track = response[0];
        const song: SongMetadata = {
          title: track.title,
          artist: track.artist?.name ?? 'Unknown artist',
          album: track.album?.title,
          url: track.id.toString(),
          length: track.duration,
          offset: 0,
          playlist: null,
          isLive: false,
          thumbnailUrl: track.album?.cover_big ?? track.album?.cover_medium ?? track.album?.cover ?? null,
          source: MediaSource.Starchild,
        };
        this.cacheTrack(song);
        return song;
      }
    } catch (error) {
      debug(`Batch track lookup failed for ID ${trackId}: ${formatError(error)}`);
    }

    return null;
  }

  async search(query: string, limit = 10): Promise<SongMetadata[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const memoryKey = `${normalizedQuery}:${limit}`;

    // 1. Check L1 in-memory cache for instant <1ms response
    const memCached = this.memorySearchCache.get(memoryKey);
    if (memCached && memCached.expiresAt > Date.now()) {
      debug(`L1 memory cache hit for search: ${query}`);
      return memCached.data;
    }

    // 2. Check single-flight in-flight promise dedup
    const existingPromise = this.inFlightSearches.get(memoryKey);
    if (existingPromise) {
      debug(`Single-flight coalesced search for: ${query}`);
      return existingPromise;
    }

    // 3. Dispatch search with single-flight wrapping
    const searchPromise = (async () => {
      try {
        const songs = await this.cache.wrap<(...args: [string, number]) => Promise<SongMetadata[]>, SongMetadata[]>(
          async (q: string, lim: number) => {
            const response = await pRetry(
              () => this.httpClient.get<DeezerSearchResponse>('music/search', {
                searchParams: {
                  q,
                  offset: 0,
                  key: this.apiKey,
                },
                timeout: {
                  request: 10000,
                },
              }).json<DeezerSearchResponse>(),
              {
                retries: 2,
                minTimeout: 250,
                maxTimeout: 1500,
                // p-retry passes a context object, not the error itself.
                onFailedAttempt: ({error, attemptNumber}) => {
                  debug(`Search retry ${attemptNumber} failed: ${formatError(error)}`);
                },
              }
            );

            return response.data.slice(0, lim).map((track) => ({
              title: track.title,
              artist: track.artist.name,
              album: track.album?.title,
              url: track.id.toString(), // Use Deezer ID for streaming
              length: track.duration,
              offset: 0,
              playlist: null,
              isLive: false,
              // Prefer the largest cover available. Discord still decides the
              // thumbnail's rendered size, but it stays crisp on high-density UI.
              thumbnailUrl: track.album?.cover_big ?? track.album?.cover_medium ?? track.album?.cover ?? null,
              source: MediaSource.Starchild,
            }));
          },
          query,
          limit,
          {
            key: `starchild:search:${query}:${limit}`,
            expiresIn: ONE_HOUR_IN_SECONDS,
          },
        );

        // Populate L1 search cache and track cache
        this.pruneExpiredCache();
        this.memorySearchCache.set(memoryKey, {
          data: songs,
          expiresAt: Date.now() + StarchildAPI.MEMORY_SEARCH_TTL_MS,
        });

        for (const song of songs) {
          this.memoryTrackCache.set(song.url, {
            song,
            expiresAt: Date.now() + StarchildAPI.MEMORY_TRACK_TTL_MS,
          });
        }

        return songs;
      } finally {
        this.inFlightSearches.delete(memoryKey);
      }
    })();

    this.inFlightSearches.set(memoryKey, searchPromise);
    return searchPromise;
  }

  getStreamUrl(trackId: string, options?: { kbps?: number; offset?: number }): string {
    const params = new URLSearchParams({
      id: trackId,
      key: this.apiKey,
    });

    if (options?.kbps) {
      params.set('kbps', options.kbps.toString());
    }

    if (options?.offset) {
      params.set('offset', options.offset.toString());
    }

    return `${this.baseUrl}/music/stream/direct?${params.toString()}`;
  }

  /**
   * Returns a stream with proper authentication headers
   * Use this instead of getStreamUrl when you need to stream the audio
   */
  getStream(trackId: string, options?: { kbps?: number; offset?: number }): ReturnType<typeof got.stream> {
    const url = this.getStreamUrl(trackId, options);
    return got.stream(url, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });
  }
}
