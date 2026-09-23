// File: src/scripts/migrate-and-start.ts

import './load-env.js';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { execa, type ExecaError } from 'execa';
import { promises as fs } from 'fs';
import ora from 'ora';
import { Pool } from 'pg';
import { startBot } from '../index.js';
import { DATA_DIR } from '../services/config.js';
import { createDatabasePath } from '../utils/create-database-url.js';
import logBanner from '../utils/log-banner.js';

// PostgreSQL is required - DATABASE_URL must be set
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required for PostgreSQL');
  process.exit(1);
}

const migrationDatabaseUrl = process.env.DATABASE_URL_UNPOOLED ?? databaseUrl;
const isFileDatabase = databaseUrl.startsWith('file:');
if (isFileDatabase) {
  console.error('SQLite is not supported. Please set DATABASE_URL to a PostgreSQL connection string.');
  process.exit(1);
}

// PostgreSQL - use adapter
const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const client = new PrismaClient({ adapter });
const prismaCliEnvironment = {
  ...process.env,
  DATABASE_URL: migrationDatabaseUrl,
};

const migrateFromSequelizeToPrisma = async () => {
  await execa('prisma', ['migrate', 'resolve', '--applied', '20220101155430_migrate_from_sequelize'], {
    preferLocal: true,
    env: prismaCliEnvironment,
  });
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
    if (isPrismaErrorWithCode(error, 'P2010')) {
      // Table doesn't exist
      return false;
    }

    throw error;
  }

  return true;
};

const isPrismaErrorWithCode = (error: unknown, code: string): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === 'string' && maybeCode === code;
};

void (async () => {
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
    await execa('prisma', ['migrate', 'deploy'], {
      preferLocal: true,
      env: prismaCliEnvironment,
    });
    spinner.succeed('Database migrations applied.');
  } catch (error: unknown) {
    if ((error as ExecaError).stderr) {
      const errorMessage = (error as ExecaError).stderr as string;

      // P3005: Database schema is not empty - need to baseline migrations first
      if (errorMessage && typeof errorMessage === 'string' && errorMessage.includes('P3005')) {
        spinner.fail('Database schema is not empty. Need to baseline migrations first.');
        console.error('\n❌ The database has an existing schema but no migration history.');
        console.error('📝 This usually means you need to baseline your migrations.\n');
        console.error('To fix this, run ONE of the following commands:\n');
        console.error('  1. Baseline existing migrations (if database has ISOBEL tables):');
        console.error('     docker compose exec bot pnpm exec prisma migrate resolve --applied "0_init"\n');
        console.error('  2. Reset and recreate the database (WARNING: deletes all data):');
        console.error('     docker compose exec bot pnpm exec prisma migrate reset --force\n');
        console.error('  3. Create a fresh baseline migration:');
        console.error('     docker compose exec bot pnpm exec prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script > baseline.sql');
        console.error('     # Then apply it manually to your database\n');
        process.exit(1);
      } else if (errorMessage && typeof errorMessage === 'string' && errorMessage.includes('P3009')) {
        spinner.fail('Prisma found a previously failed migration.');
        console.error('\n❌ The database contains a failed migration record, so startup was stopped.');
        console.error('📝 Resolve the failed migration first, then restart the bot.\n');
        console.error('Typical fixes:');
        console.error('  1. Inspect the failed migration in `_prisma_migrations` and your database logs');
        console.error('  2. Mark it rolled back after fixing the underlying issue:');
        console.error('     pnpm exec prisma migrate resolve --rolled-back "<migration_name>"');
        console.error('  3. Re-run migrations:');
        console.error('     pnpm exec prisma migrate deploy\n');
        process.exit(1);
      } else if (errorMessage && typeof errorMessage === 'string' && errorMessage.includes('P1001')) {
        spinner.fail('Could not reach the database server for migrations.');
        console.error('\n❌ Prisma could not connect to the database during startup.');
        console.error('📝 Verify `DATABASE_URL`, network access, and database firewall settings.');
        console.error('If you are using a pooled provider URL for runtime traffic, set `DATABASE_URL_UNPOOLED` for migrations.\n');
        process.exit(1);
      } else {
        spinner.fail('Failed to apply database migrations:');
        console.error(errorMessage);
        process.exit(1);
      }
    } else {
      throw error;
    }
  }

  await startBot();
})();
