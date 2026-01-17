// File: web/scripts/migrate.ts

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../src/db/schema';

// Load environment variables from .env file
config();

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (!databaseUrl) {
  console.error('DATABASE_URL or POSTGRES_URL environment variable is required');
  process.exit(1);
}

const client = postgres(databaseUrl, {
  max: 1, // Use single connection for migrations
});

const db = drizzle(client, { schema });

async function runMigrations() {
  try {
    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
