// File: src/scripts/verify-database.ts

/**
 * Database Verification Script
 *
 * Tests PostgreSQL database connection and checks migration status.
 * Run with: pnpm verify:db
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { validatePostgresUrl } from '../utils/env-validation.js';

// Load environment variables
config();

console.log('🔍 Verifying database connection...\n');

async function verifyDatabase() {
  // Validate DATABASE_URL format
  const urlValidation = validatePostgresUrl(process.env.DATABASE_URL);

  if (!urlValidation.valid) {
    console.error('❌ DATABASE_URL validation failed:');
    for (const error of urlValidation.errors) {
      console.error(`  - ${error}`);
    }
    return false;
  }

  if (urlValidation.warnings.length > 0) {
    console.warn('⚠️  DATABASE_URL warnings:');
    for (const warning of urlValidation.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  // Test actual connection
  const prisma = new PrismaClient();

  try {
    console.log('🔌 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful!');

    // Try a simple query
    console.log('\n📊 Checking database...');
    const result = await prisma.$queryRaw<{version: string}[]>`SELECT version()`;
    console.log(`✅ PostgreSQL version: ${result[0].version.split(' ')[0]} ${result[0].version.split(' ')[1]}`);

    // Check if migrations are applied
    console.log('\n📋 Checking migration status...');
    try {
      // Simple check - try to query a known table
      await prisma.setting.findFirst();
      console.log('✅ Database schema appears to be set up correctly');
    } catch {
      console.warn('⚠️  Database tables may not exist yet');
      console.warn('   Run migrations with: pnpm prisma:migrate:deploy');
    }

    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);

      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n   The database server is not reachable.');
        console.error('   Make sure PostgreSQL is running and the host/port are correct.');
      } else if (error.message.includes('password authentication failed')) {
        console.error('\n   Password authentication failed.');
        console.error('   Check your DATABASE_URL username and password.');
      } else if (error.message.includes('database') && error.message.includes('does not exist')) {
        console.error('\n   The database does not exist.');
        console.error('   Create it first, then run: pnpm prisma:migrate:deploy');
      }
    } else {
      console.error('   Unknown error:', error);
    }

    await prisma.$disconnect();
    return false;
  }
}

verifyDatabase()
  .then(success => {
    if (success) {
      console.log('\n✅ Database verification passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Database verification failed!\n');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
