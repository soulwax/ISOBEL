// File: src/services/health-server.ts

import { type Client } from 'discord.js';
import http from 'http';
import { inject, injectable } from 'inversify';
import { TYPES } from '../types.js';
import debug from '../utils/debug.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface HealthResponse {
  status: 'ok' | 'not_ready';
  ready: boolean;
  guilds: number;
  uptime: number;
  uptimeFormatted: string;
  timestamp: string;
}

@injectable()
export default class HealthServer {
  private readonly client: Client;
  private server: http.Server | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly rateLimitPoints = 10; // 10 requests
  private readonly rateLimitWindow = 60_000; // per 60 seconds
  private readonly defaultHealthPort = 3002;
  private static readonly jsonContentType = {'Content-Type': 'application/json'};

  constructor(
    @inject(TYPES.Client) client: Client,
  ) {
    this.client = client;
  }

  private getClientIdentifier(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];

    const forwardedHeader = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = typeof forwardedHeader === 'string'
      ? forwardedHeader.split(',')[0].trim()
      : req.socket.remoteAddress ?? 'unknown';

    return ip;
  }

  private resolvePort(): number {
    const configuredPort = process.env.HEALTH_PORT ?? process.env.PORT ?? String(this.defaultHealthPort);
    const parsedPort = Number.parseInt(configuredPort, 10);
    return Number.isNaN(parsedPort) ? this.defaultHealthPort : parsedPort;
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    res.writeHead(statusCode, HealthServer.jsonContentType);
    res.end(JSON.stringify(payload));
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired entry
      this.rateLimitMap.set(identifier, {
        count: 1,
        resetTime: now + this.rateLimitWindow,
      });
      return true;
    }

    if (entry.count >= this.rateLimitPoints) {
      return false;
    }

    entry.count++;
    return true;
  }

  public start(): void {
    const port = this.resolvePort();

    if (this.server) {
      this.stop();
    }

    // Clear any existing interval before creating a new one
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clean up old rate limit entries periodically
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.rateLimitMap.entries()) {
        if (now > entry.resetTime) {
          this.rateLimitMap.delete(key);
        }
      }
    }, this.rateLimitWindow);
    this.cleanupInterval.unref();

    this.server = http.createServer((req, res) => {
      this.setCorsHeaders(res);

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url !== '/health' || req.method !== 'GET') {
        this.sendJson(res, 404, {error: 'Not found'});
        return;
      }

      const identifier = this.getClientIdentifier(req);
      if (!this.checkRateLimit(identifier)) {
        this.sendJson(res, 429, {error: 'Too many requests'});
        return;
      }

      const healthData = this.getHealthData();
      this.sendJson(res, healthData.ready ? 200 : 503, healthData);
    });

    this.server.on('error', error => {
      debug(`health-server.error: ${this.normalizeError(error).message}`);
    });

    this.server.listen(port, () => {
      debug(`🏥 Health server running on http://localhost:${port}`);
    });
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.rateLimitMap.clear();
  }

  private getHealthData(): HealthResponse {
    const ready = this.client.isReady();
    const uptime = this.client.uptime ?? 0;

    return {
      status: ready ? 'ok' : 'not_ready',
      ready,
      guilds: this.client.guilds.cache.size,
      uptime,
      uptimeFormatted: this.formatUptime(uptime),
      timestamp: new Date().toISOString(),
    };
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error('Unknown error occurred');
  }

  private formatUptime(uptime: number): string {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
