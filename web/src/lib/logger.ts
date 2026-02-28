// File: web/src/lib/logger.ts

import { mkdirSync } from 'node:fs';
import winston from 'winston';

/**
 * Configured Winston logger instance
 */
const isVercelRuntime = process.env.VERCEL === '1'
  || Boolean(process.env.VERCEL_ENV)
  || Boolean(process.env.NOW_REGION);

const transports: winston.transport[] = [];

if (!isVercelRuntime) {
  try {
    // Keep file logging for local/VM deployments where persistent logs are useful.
    mkdirSync('logs', { recursive: true });
    transports.push(
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    );
  } catch (error) {
    // If file transports cannot be initialized, continue with console logging.
    console.warn('File logger initialization failed. Falling back to console logging only.', error);
  }
}

const shouldUseConsole = process.env.NODE_ENV !== 'production' || isVercelRuntime || transports.length === 0;

if (shouldUseConsole) {
  const consoleFormat = process.env.NODE_ENV !== 'production'
    ? winston.format.combine(winston.format.colorize(), winston.format.simple())
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      );

  transports.push(new winston.transports.Console({ format: consoleFormat }));
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'isobel-web' },
  transports,
});
