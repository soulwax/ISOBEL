// File: web/src/db/index.ts

import { loadEnvWithSafeguard } from '../lib/load-env.js';
loadEnvWithSafeguard();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { getEnv } from '../lib/env.js';

// Get database URL from environment
const databaseUrl = getEnv('DATABASE_URL', getEnv('POSTGRES_URL', ''));

if (!databaseUrl) {
  throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}

// Create postgres connection
// Use connection pooling for better performance
// For serverless (Vercel), consider using a connection pooler like Neon's built-in pooling
const client = postgres(databaseUrl, {
  max: process.env.VERCEL ? 1 : 10, // Serverless: 1 connection per function instance
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  // For serverless, connections are short-lived, so we don't need a large pool
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
