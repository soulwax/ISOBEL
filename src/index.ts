// File: src/index.ts

import { mkdir } from 'node:fs/promises';
import path from 'path';
import type Bot from './bot.js';
import container from './inversify.config.js';
import type Config from './services/config.js';
import type FileCacheProvider from './services/file-cache.js';
import { TYPES } from './types.js';

const bot = container.get<Bot>(TYPES.Bot);

const startBot = async () => {
  // Create data directories if necessary
  const config = container.get<Config>(TYPES.Config);

  await mkdir(config.DATA_DIR, {recursive: true});
  await mkdir(config.CACHE_DIR, {recursive: true});
  await mkdir(path.join(config.CACHE_DIR, 'tmp'), {recursive: true});

  await container.get<FileCacheProvider>(TYPES.FileCache).cleanup();

  await bot.register();
};

export { startBot };
