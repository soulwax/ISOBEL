// File: src/services/songbird-next.ts

import got, { type Got } from 'got';
import { inject, injectable } from 'inversify';
import { TYPES } from '../types.js';
import debug from '../utils/debug.js';
import { formatError } from '../utils/error-msg.js';
import type Config from './config.js';

interface SpiceUpResponseDto {
  recommendations?: {
    name?: string;
    artists?: {name?: string}[];
  }[];
}

@injectable()
export default class SongbirdNext {
  private readonly baseUrl: string;
  private readonly httpClient: Got | null;

  constructor(@inject(TYPES.Config) config: Config) {
    this.baseUrl = config.SONGBIRD_NEXT_URL?.trim() ?? '';
    this.httpClient = this.baseUrl
      ? got.extend({prefixUrl: this.baseUrl})
      : null;
  }

  async getRecommendations(input: {title: string; artist: string}): Promise<string[]> {
    if (!this.httpClient) {
      return [];
    }

    try {
      const response = await this.httpClient.post('api/spotify/recommendations/spice-up', {
        json: {
          songs: [{name: input.title, artist: input.artist}],
          limit: 5,
          mode: 'normal',
        },
        timeout: {request: 8000},
      }).json<SpiceUpResponseDto>();

      const recommendations = response?.recommendations ?? [];
      return recommendations
        .map(track => {
          const name = track.name?.trim();
          const artist = track.artists?.map(a => a.name).filter(Boolean).join(', ').trim();
          if (!name || !artist) {
            return null;
          }
          return `${artist} - ${name}`;
        })
        .filter((value): value is string => Boolean(value));
    } catch (error) {
      debug(`Songbird Next recommendations failed: ${formatError(error)}`);
      return [];
    }
  }
}
