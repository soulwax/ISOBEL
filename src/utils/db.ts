// File: src/utils/db.ts

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

// PostgreSQL is required - DATABASE_URL must be set
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
const cleanup = async () => {
  await prisma.$disconnect();
  await pool.end();
};

process.on('beforeExit', () => {
  void cleanup();
});

process.on('SIGINT', () => {
  void cleanup().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void cleanup().then(() => process.exit(0));
});
