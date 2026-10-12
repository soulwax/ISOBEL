// File: src/scripts/run-with-database-url.ts

import { execa } from 'execa';
import { DATA_DIR } from '../services/config.js';
import createDatabaseUrl from '../utils/create-database-url.js';

void (async () => {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const runtimeDatabaseUrl = process.env.DATABASE_URL ?? createDatabaseUrl(DATA_DIR);
  const isPrismaMigration = args[0] === 'prisma' && args[1] === 'migrate';

  // Prisma Migrate uses session-level advisory locks. The local Neon pooler is
  // in transaction mode, where those locks can outlive a client request and
  // block bot startup. Use the direct endpoint for every Prisma migrate action.
  const databaseUrl = isPrismaMigration
    ? process.env.DATABASE_URL_UNPOOLED ?? runtimeDatabaseUrl
    : runtimeDatabaseUrl;

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
