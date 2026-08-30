// File: web/src/lib/shutdown.ts

import type { Server } from 'node:http';
import { sqlClient } from '../db/index.js';
import { logger } from './logger.js';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

// Must stay below stop_timeout_secs in the oxfile, so a stuck connection
// never turns a graceful stop into a SIGKILL.
const DRAIN_TIMEOUT_MS = 10_000;

// Stop accepting connections, let in-flight requests finish, close the pool.
export function installGracefulShutdown(server: Server, name: string): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`${name}: ${signal} received, draining connections`);

    const forceExit = setTimeout(() => {
      logger.warn(`${name}: drain timed out after ${DRAIN_TIMEOUT_MS}ms, exiting anyway`);
      process.exit(0);
    }, DRAIN_TIMEOUT_MS);
    forceExit.unref();

    server.close((error) => {
      if (error) {
        logger.error(`${name}: error while closing server`, { error });
      }

      void sqlClient
        .end({ timeout: 5 })
        .catch((poolError: unknown) => {
          logger.error(`${name}: error while closing database pool`, { error: poolError });
        })
        .finally(() => {
          clearTimeout(forceExit);
          logger.info(`${name}: shutdown complete`);
          process.exit(0);
        });
    });

    // Keep-alive sockets would otherwise hold server.close() open.
    server.closeIdleConnections();
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      shutdown(signal);
    });
  }
}

// Log the reason, then exit non-zero so the process manager restarts us
// instead of leaving the process alive in an unknown state.
export function installCrashHandlers(name: string): void {
  process.on('uncaughtException', (error) => {
    logger.error(`${name}: uncaught exception, exiting`, { error });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`${name}: unhandled rejection, exiting`, { reason });
    process.exit(1);
  });
}
