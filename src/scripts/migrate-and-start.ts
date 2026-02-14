// File: src/scripts/migrate-and-start.ts

// CRITICAL: This must be the FIRST import to load environment variables
import './load-env.js';

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { execa, ExecaError } from 'execa';
import { promises as fs } from 'fs';
import ora from 'ora';
import { startBot } from '../index.js';
import { DATA_DIR } from '../services/config.js';
import createDatabaseUrl, { createDatabasePath } from '../utils/create-database-url.js';
import logBanner from '../utils/log-banner.js';

// PostgreSQL is required - DATABASE_URL must be set
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required for PostgreSQL');
  process.exit(1);
}

const isFileDatabase = databaseUrl.startsWith('file:');
if (isFileDatabase) {
  console.error('SQLite is not supported. Please set DATABASE_URL to a PostgreSQL connection string.');
  process.exit(1);
}

// PostgreSQL - use adapter
const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const client = new PrismaClient({ adapter });

const migrateFromSequelizeToPrisma = async () => {
  await execa('prisma', ['migrate', 'resolve', '--applied', '20220101155430_migrate_from_sequelize'], {preferLocal: true});
};

const doesUserHaveExistingDatabase = async () => {
  try {
    await fs.access(createDatabasePath(DATA_DIR));

    return true;
  } catch {
    return false;
  }
};

const hasDatabaseBeenMigratedToPrisma = async () => {
  try {
    await client.$queryRaw`SELECT COUNT(id) FROM _prisma_migrations`;
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error as Prisma.PrismaClientKnownRequestError).code === 'P2010') {
      // Table doesn't exist
      return false;
    }

    throw error;
  }

  return true;
};

(async () => {
  // Banner
  logBanner();

  const spinner = ora('Applying database migrations...').start();

  if (isFileDatabase && await doesUserHaveExistingDatabase()) {
    if (!(await hasDatabaseBeenMigratedToPrisma())) {
      try {
        await migrateFromSequelizeToPrisma();
      } catch (error) {
        if ((error as ExecaError).stderr) {
          spinner.fail('Failed to apply database migrations (going from Sequelize to Prisma):');
          console.error((error as ExecaError).stderr);
          process.exit(1);
        } else {
          throw error;
        }
      }
    }
  }

  try {
    await execa('prisma', ['migrate', 'deploy'], {preferLocal: true});
  } catch (error: unknown) {
    if ((error as ExecaError).stderr) {
      spinner.fail('Failed to apply database migrations:');
      console.error((error as ExecaError).stderr);
      process.exit(1);
    } else {
      throw error;
    }
  }

  spinner.succeed('Database migrations applied.');

  await startBot();
})();
