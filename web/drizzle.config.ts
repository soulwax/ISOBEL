// File: web/drizzle.config.ts

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL or POSTGRES_URL environment variable is required for drizzle-kit.\n' +
    'Please set one of these variables in your .env file or environment.'
  );
}

// Drizzle Kit uses node-postgres, whose `sslmode=require` handling verifies
// the certificate hostname. The local Neon stack is reached through
// 127.0.0.1 while its certificate is issued for the public hostname, so use
// libpq-compatible `require` semantics for schema tooling only. The web
// runtime uses postgres.js and keeps the application URL unchanged.
const drizzleDatabaseUrl = new URL(databaseUrl);
drizzleDatabaseUrl.searchParams.set('uselibpqcompat', 'true');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // The bot uses Prisma in the same database. Keep Drizzle scoped to the
  // tables owned by the web app so `db:push` never proposes dropping the
  // bot's `_prisma_migrations`, `Setting`, or `super_user` tables.
  tablesFilter: [
    '*',
    '!_prisma_migrations',
    '!Setting',
    '!super_user',
    '!FavoriteQuery',
    '!FileCache',
    '!KeyValueCache',
    '!PlaybackAction',
    '!SongPlay',
  ],
  dbCredentials: {
    url: drizzleDatabaseUrl.toString(),
  },
});
