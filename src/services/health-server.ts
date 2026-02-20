// File: src/services/health-server.ts

import http from 'http';
import { injectable, inject } from 'inversify';
import { Client } from 'discord.js';
import { TYPES } from '../types.js';
import Config from './config.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@injectable()
export default class HealthServer {
  private readonly client: Client;
  private readonly config: Config;
  private server: http.Server | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly rateLimitPoints = 10; // 10 requests
  private readonly rateLimitWindow = 60_000; // per 60 seconds

  constructor(
    @inject(TYPES.Client) client: Client,
    @inject(TYPES.Config) config: Config
  ) {
    this.client = client;
    this.config = config;
  }

  private getClientIdentifier(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' 
      ? forwarded.split(',')[0].trim() 
      : req.socket.remoteAddress || 'unknown';
    return ip;
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
    const configuredPort = process.env.HEALTH_PORT ?? process.env.PORT ?? '3002';
    const parsedPort = parseInt(configuredPort, 10);
    const port = Number.isNaN(parsedPort) ? 3002 : parsedPort;

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

    this.server = http.createServer((req, res) => {
      // Set CORS headers - always allow access from anywhere
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Rate limiting
      if (req.url === '/health' && req.method === 'GET') {
        const identifier = this.getClientIdentifier(req);
        if (!this.checkRateLimit(identifier)) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Too many requests' }));
          return;
        }
      }

      if (req.url === '/health' && req.method === 'GET') {
        const isReady = this.client.isReady();
        const guildsCount = this.client.guilds.cache.size;
        const uptime = this.client.uptime || 0;

        const healthData = {
          status: isReady ? 'ok' : 'not_ready',
          ready: isReady,
          guilds: guildsCount,
          uptime: uptime,
          uptimeFormatted: this.formatUptime(uptime),
          timestamp: new Date().toISOString(),
        };

        res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.server.listen(port, () => {
      console.log(`🏥 Health server running on http://localhost:${port}`);
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
