// File: src/services/get-songs.ts

import ffmpeg from 'fluent-ffmpeg';
import { inject, injectable } from 'inversify';
import { URL } from 'node:url';
import { TYPES } from '../types.js';
import { MediaSource, SongMetadata } from './player.js';
import StarchildAPI from './starchild-api.js';

@injectable()
export default class {
  private readonly starchildAPI: StarchildAPI;

  constructor(@inject(TYPES.Services.StarchildAPI) starchildAPI: StarchildAPI) {
    this.starchildAPI = starchildAPI;
  }

  async getSongs(query: string, playlistLimit: number): Promise<[SongMetadata[], string]> {
    const newSongs: SongMetadata[] = [];
    const extraMsg = '';

    // Test if it's a complete URL (for HLS streams)
    try {
      const url = new URL(query);

      // Validate protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }

      // Security: Block localhost/internal IPs to prevent SSRF attacks
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'localhost' 
          || hostname === '127.0.0.1' 
          || hostname.startsWith('127.')
          || hostname.startsWith('192.168.')
          || hostname.startsWith('10.')
          || hostname.startsWith('172.16.')
          || hostname === '::1'
          || hostname === '[::1]') {
        throw new Error('Local URLs are not allowed');
      }

      // Check if it's an HLS stream
      const song = await this.httpLiveStream(query);

      if (song) {
        newSongs.push(song);
        return [newSongs, extraMsg];
      }
    } catch (error) {
      // If it's a TypeError, it's not a URL - continue to search
      if (error instanceof TypeError) {
        // Not a URL, continue to search
      } else {
        // Other errors (validation failures) should be thrown
        throw error;
      }
    }

    // Search using Starchild API
    const songs = await this.starchildAPI.search(query, playlistLimit);

    if (songs.length === 0) {
      throw new Error('that doesn\'t exist');
    }

    newSongs.push(...songs);

    return [newSongs, extraMsg];
  }

  private async httpLiveStream(url: string): Promise<SongMetadata | null> {
    return new Promise((resolve) => {
      ffmpeg(url).ffprobe((err) => {
        if (err) {
          resolve(null);
          return;
        }

        resolve({
          url,
          source: MediaSource.HLS,
          isLive: true,
          title: url,
          artist: url,
          length: 0,
          offset: 0,
          playlist: null,
          thumbnailUrl: null,
        });
      });
    });
  }
}
