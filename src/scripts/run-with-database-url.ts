// File: src/scripts/run-with-database-url.ts

import { execa } from 'execa';
import { DATA_DIR } from '../services/config.js';
import createDatabaseUrl from '../utils/create-database-url.js';

void (async () => {
  const databaseUrl = process.env.DATABASE_URL ?? createDatabaseUrl(DATA_DIR);
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  await execa(args[0], args.slice(1), {
    preferLocal: true,
    stderr: process.stderr,
    stdout: process.stdout,
    stdin: process.stdin,
    env: {
      DATABASE_URL: databaseUrl,
    },
  });
})();
