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

  async search(query: string, limit = 10): Promise<SongMetadata[]> {
    return this.cache.wrap<(...args: [string, number]) => Promise<SongMetadata[]>, SongMetadata[]>(
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
            onFailedAttempt: (error) => {
              debug(`Search retry ${error.attemptNumber} failed: ${formatError(error)}`);
            },
          }
        );

        return response.data.slice(0, lim).map((track) => ({
          title: track.title,
          artist: track.artist.name,
          url: track.id.toString(), // Use Deezer ID for streaming
          length: track.duration,
          offset: 0,
          playlist: null,
          isLive: false,
          thumbnailUrl: track.album.cover_medium ?? track.album.cover ?? null,
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
