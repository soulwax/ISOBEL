// File: web/drizzle.config.ts

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL or POSTGRES_URL environment variable is required for drizzle-kit.\n' +
    'Please set one of these variables in your .env file or environment.'
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
