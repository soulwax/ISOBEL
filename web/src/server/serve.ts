// File: web/src/server/serve.ts
// Single-process production server: API (including auth) + static frontend.

import { loadEnvWithSafeguard } from '../lib/load-env.js';
loadEnvWithSafeguard();

import { join } from 'path';
import { createApp } from './app.js';
import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const PORT = parseInt(getEnv('PORT', '3001'), 10);
const buildDir = join(process.cwd(), 'build');

const app = createApp({
  serveStatic: true,
  buildDir,
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Web server running on http://0.0.0.0:${PORT} (API + static)`);
});
