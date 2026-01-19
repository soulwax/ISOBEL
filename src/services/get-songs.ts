// File: src/services/get-songs.ts

import ffmpeg from 'fluent-ffmpeg';
import got from 'got';
import { inject, injectable } from 'inversify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import { TYPES } from '../types.js';
import debug from '../utils/debug.js';
import { MediaSource, SongMetadata } from './player.js';
import StarchildAPI from './starchild-api.js';

@injectable()
export default class {
  private readonly starchildAPI: StarchildAPI;
  private readonly execFileAsync = promisify(execFile);

  constructor(@inject(TYPES.Services.StarchildAPI) starchildAPI: StarchildAPI) {
    this.starchildAPI = starchildAPI;
  }

  async getSongs(query: string, playlistLimit: number): Promise<[SongMetadata[], string]> {
    const newSongs: SongMetadata[] = [];
    const extraMsg = '';
    let searchQuery = query;
    let isYouTubeLink = false;

    // Test if it's a complete URL (for HLS streams)
    // Only catch TypeError from URL parsing - this indicates the query is not a valid URL
    try {
      const url = new URL(query);

      if (this.isYouTubeUrl(url)) {
        isYouTubeLink = true;
        const title = await this.fetchYouTubeTitle(query);
        if (title) {
          searchQuery = title;
        }
      }

      // Validate protocol - invalid protocol means it's not a stream URL, treat as search query
      if (!['http:', 'https:'].includes(url.protocol)) {
        // Invalid protocol - treat as search query, not a stream URL
        // Fall through to API search
      } else if (!isYouTubeLink) {
        // Security: Block localhost/internal IPs to prevent SSRF attacks
        // Blocked URLs are treated as search queries, not stream URLs
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'localhost' 
            || hostname === '127.0.0.1' 
            || hostname.startsWith('127.')
            || hostname.startsWith('192.168.')
            || hostname.startsWith('10.')
            || hostname.startsWith('172.16.')
            || hostname === '::1'
            || hostname === '[::1]') {
          // Blocked URL - treat as search query, not a stream URL
          // Fall through to API search
        } else {
          // URL is valid and passes security checks - try to use it as HLS stream
          // Start API search in parallel so a slow probe doesn't block results
          const searchPromise = this.starchildAPI.search(searchQuery, playlistLimit);
          const hlsProbe = this.withTimeout(this.httpLiveStream(query), 1500);

          try {
            const song = await hlsProbe;
            if (song) {
              newSongs.push(song);
              return [newSongs, extraMsg];
            }
            // If httpLiveStream returns null or times out, fall through to API search
          } catch (error) {
            // Unexpected error from httpLiveStream - log it but don't crash
            // Treat as failed stream attempt and fall through to API search
            debug(`Error checking HLS stream for ${query}: ${error instanceof Error ? error.message : String(error)}`);
          }

          const songs = await searchPromise;
          if (songs.length === 0) {
            throw new Error('that doesn\'t exist');
          }

          newSongs.push(...songs);
          return [newSongs, extraMsg];
        }
      }
    } catch (error) {
      // TypeError from URL constructor means the query is not a valid URL
      // This is expected and normal - treat as search query
      if (error instanceof TypeError) {
        // Not a valid URL - continue to API search
      } else {
        // Unexpected error during URL parsing - log it but still try API search
        // This should rarely happen, but we don't want to crash on edge cases
        debug(`Unexpected error parsing URL ${query}: ${error instanceof Error ? error.message : String(error)}`);
        // Fall through to API search
      }
    }

    // Search using Starchild API
    const songs = await this.starchildAPI.search(searchQuery, playlistLimit);

    if (songs.length === 0) {
      if (isYouTubeLink) {
        const youtubeSong = await this.getYouTubeSong(query);
        newSongs.push(youtubeSong);
        return [newSongs, extraMsg];
      }
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

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
    const timeout = new Promise<null>(resolve => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    return Promise.race([promise, timeout]);
  }

  private isYouTubeUrl(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host === 'youtu.be'
      || host === 'youtube.com'
      || host.endsWith('.youtube.com')
      || host === 'music.youtube.com';
  }

  private async fetchYouTubeTitle(url: string): Promise<string | null> {
    try {
      const response = await got.get('https://www.youtube.com/oembed', {
        searchParams: {
          url,
          format: 'json',
        },
        timeout: {
          request: 3000,
        },
      }).json<{title?: string}>();
      const title = response?.title?.trim();
      return title && title.length > 0 ? title : null;
    } catch (error) {
      debug(`YouTube oEmbed lookup failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  public async getYouTubeSong(query: string): Promise<SongMetadata> {
    const input = this.normalizeYouTubeInput(query);
    return this.fetchYouTubeSong(input);
  }

  private normalizeYouTubeInput(query: string): string {
    try {
      const url = new URL(query);
      if (this.isYouTubeUrl(url)) {
        return query;
      }
    } catch {
      // Not a URL, treat as search.
    }

    return `ytsearch1:${query}`;
  }

  private async fetchYouTubeSong(input: string): Promise<SongMetadata> {
    try {
      const {stdout} = await this.execFileAsync('yt-dlp', [
        '--no-playlist',
        '-f',
        'bestaudio/best',
        '--print-json',
        input,
      ], {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });

      const lines = stdout.trim().split('\n').filter(Boolean);
      const payload = lines[lines.length - 1];
      if (!payload) {
        throw new Error('yt-dlp did not return metadata');
      }

      const data = JSON.parse(payload) as {
        title?: string;
        uploader?: string;
        channel?: string;
        duration?: number;
        url?: string;
        thumbnail?: string;
        is_live?: boolean;
      };

      if (!data.url || !data.title) {
        throw new Error('yt-dlp returned incomplete metadata');
      }

      return {
        url: data.url,
        source: MediaSource.YouTube,
        isLive: data.is_live ?? false,
        title: data.title,
        artist: data.uploader ?? data.channel ?? 'YouTube',
        length: data.duration ?? 0,
        offset: 0,
        playlist: null,
        thumbnailUrl: data.thumbnail ?? null,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as {code: string}).code === 'ENOENT') {
        throw new Error('yt-dlp is not installed or not in PATH');
      }
      debug(`yt-dlp failed for ${input}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('sorry, no matching song found for that YouTube link');
    }
  }
}
