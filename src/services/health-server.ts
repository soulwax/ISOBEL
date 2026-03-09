// File: src/services/health-server.ts

import { type Client } from 'discord.js';
import express from 'express';
import type http from 'http';
import { inject, injectable } from 'inversify';
import { TYPES } from '../types.js';
import debug from '../utils/debug.js';

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
  private readonly defaultHealthPort = 3002;

  constructor(
    @inject(TYPES.Client) client: Client,
  ) {
    this.client = client;
  }

  private resolvePort(): number {
    const configuredPort = process.env.HEALTH_PORT ?? process.env.PORT ?? String(this.defaultHealthPort);
    const parsedPort = Number.parseInt(configuredPort, 10);
    return Number.isNaN(parsedPort) ? this.defaultHealthPort : parsedPort;
  }

  public async start(): Promise<void> {
    const port = this.resolvePort();

    if (this.server) {
      this.stop();
    }

    const app = express();

    // Bot health route — mounted first so it takes priority
    app.get('/health', (_req, res) => {
      const data = this.getHealthData();
      res.status(data.ready ? 200 : 503).json(data);
    });

    const server = app.listen(port, () => {
      debug(`🏥 HTTP server running on http://localhost:${port}`);
    });

    server.on('error', error => {
      debug(`health-server.error: ${this.normalizeError(error).message}`);
    });

    this.server = server;
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
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

    const totalSeconds = seconds 24 * 60 * 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);



    if (totalDays > 0) {
      return `${totalDays}d ${totalHours % 24}h ${totalMinutes % 60}m`;
    } else if (totalHours > 0) {
      return `${totalHours}h ${totalMinutes % 60}m`;
    } else if (totalMinutes > 0) {
      return `${totalMinutes}m ${totalSeconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
