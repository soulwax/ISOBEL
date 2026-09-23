// File: src/scripts/verify-environment.ts

/**
 * Environment Verification Script
 *
 * Validates all required environment variables for the bot to run properly.
 * Run with: pnpm verify:env
 */

import { loadEnvFiles } from '../utils/load-env.js';
import { validateBotEnvironment } from '../utils/env-validation.js';

// Load environment variables
loadEnvFiles();

console.log('🔍 Verifying ISOBEL environment configuration...\n');

try {
  const result = validateBotEnvironment(false);

  if (!result.valid) {
    console.error('\n❌ Environment validation failed!');
    console.error('\nPlease fix the errors above before starting the bot.');
    console.error('Check your .env file and compare with .env.example\n');
    process.exit(1);
  }

  console.log('\n✅ All required environment variables are properly configured!');
  console.log('\nYou can now start the bot with:');
  console.log('  - Development: pnpm dev');
  console.log('  - Production:  pnpm pm2:start:prod\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Unexpected error during validation:', error);
  process.exit(1);
}
