// File: src/services/get-songs.ts

import got from 'got';
import { inject, injectable } from 'inversify';
import { execFile } from 'node:child_process';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import { TYPES } from '../types.js';
import debug from '../utils/debug.js';
import { formatError } from '../utils/error-msg.js';
import { MediaSource, type SongMetadata } from './player.js';
import type StarchildAPI from './starchild-api.js';

@injectable()
export default class GetSongs {
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
        if (this.isPrivateHost(hostname)) {
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
            debug(`Error checking HLS stream for ${query}: ${formatError(error)}`);
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
        debug(`Unexpected error parsing URL ${query}: ${formatError(error)}`);
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
    try {
      await this.execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=format_name',
        '-of', 'default=noprint_wrappers=1',
        url,
      ], {timeout: 5000});
      return {
        url,
        source: MediaSource.HLS,
        isLive: true,
        title: url,
        artist: url,
        length: 0,
        offset: 0,
        playlist: null,
        thumbnailUrl: null,
      };
    } catch {
      return null;
    }
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

  /**
   * Checks if a hostname resolves to a private/internal network address.
   * Used to prevent SSRF attacks by blocking requests to internal services.
   * Covers RFC 1918, RFC 5737, RFC 6598, loopback, and link-local ranges.
   */
  private isPrivateHost(hostname: string): boolean {
    // Loopback
    if (hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname.startsWith('127.')
      || hostname === '::1'
      || hostname === '[::1]') {
      return true;
    }

    // RFC 1918 private ranges
    if (hostname.startsWith('10.')
      || hostname.startsWith('192.168.')) {
      return true;
    }

    // 172.16.0.0/12 — covers 172.16.x.x through 172.31.x.x
    if (hostname.startsWith('172.')) {
      const secondOctet = this.getSecondIpv4Octet(hostname);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }

    // Link-local (169.254.x.x)
    if (hostname.startsWith('169.254.')) {
      return true;
    }

    // RFC 6598 shared address space (100.64.0.0/10)
    if (hostname.startsWith('100.')) {
      const secondOctet = this.getSecondIpv4Octet(hostname);
      if (secondOctet >= 64 && secondOctet <= 127) {
        return true;
      }
    }

    // Unspecified / "this network"
    if (hostname === '0.0.0.0' || hostname === '[::]') {
      return true;
    }

    // IPv6 mapped/embedded IPv4 (e.g., ::ffff:127.0.0.1)
    if (hostname.startsWith('::ffff:') || hostname.startsWith('[::ffff:')) {
      const ipv4Part = hostname.replace(/^\[?::ffff:/, '').replace(/]$/, '');
      return this.isPrivateHost(ipv4Part);
    }

    // IPv6 unique local (fc00::/7)
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return true;
    }

    // IPv6 link-local (fe80::/10)
    if (hostname.startsWith('fe80')) {
      return true;
    }

    return false;
  }

  private getSecondIpv4Octet(hostname: string): number {
    const octets = hostname.split('.');
    const secondOctetRaw = octets[1];
    if (secondOctetRaw === undefined) {
      return -1;
    }

    const secondOctet = Number.parseInt(secondOctetRaw, 10);
    return Number.isNaN(secondOctet) ? -1 : secondOctet;
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
      debug(`YouTube oEmbed lookup failed for ${url}: ${formatError(error)}`);
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
      debug(`yt-dlp failed for ${input}: ${formatError(error)}`);
      throw new Error('sorry, no matching song found for that YouTube link');
    }
  }
}
