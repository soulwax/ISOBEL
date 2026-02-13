// File: src/utils/env-validation.ts

/**
 * Environment Variable Validation Utilities
 *
 * Provides functions to validate required environment variables and their formats.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that required environment variables are set
 * @param vars Array of environment variable names that are required
 * @returns ValidationResult with any errors found
 */
export function validateRequiredEnv(vars: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of vars) {
    const value = process.env[varName];

    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a PostgreSQL DATABASE_URL format
 * @param url The DATABASE_URL to validate
 * @returns ValidationResult with any errors found
 */
export function validatePostgresUrl(url: string | undefined): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!url || url.trim() === '') {
    errors.push('DATABASE_URL is empty or not set');
    return { valid: false, errors, warnings };
  }

  // Check for PostgreSQL prefix
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    errors.push('DATABASE_URL must start with postgresql:// or postgres://');
  }

  // Check for basic URL structure
  try {
    const parsedUrl = new URL(url);

    // Validate has username
    if (!parsedUrl.username) {
      warnings.push('DATABASE_URL does not contain a username');
    }

    // Validate has password
    if (!parsedUrl.password) {
      warnings.push('DATABASE_URL does not contain a password (not recommended for production)');
    }

    // Validate has hostname
    if (!parsedUrl.hostname) {
      errors.push('DATABASE_URL does not contain a hostname');
    }

    // Validate has database name (pathname)
    if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
      errors.push('DATABASE_URL does not contain a database name');
    }

    // Recommend sslmode for remote databases
    if (parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
      if (!parsedUrl.searchParams.has('sslmode')) {
        warnings.push('DATABASE_URL for remote database should include ?sslmode=require');
      }
    }
  } catch (error) {
    errors.push(`DATABASE_URL is not a valid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a Discord bot token format
 * @param token The Discord token to validate
 * @returns ValidationResult with any errors found
 */
export function validateDiscordToken(token: string | undefined): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!token || token.trim() === '') {
    errors.push('DISCORD_TOKEN is empty or not set');
    return { valid: false, errors, warnings };
  }

  // Discord bot tokens typically have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    errors.push('DISCORD_TOKEN format appears invalid (expected 3 parts separated by dots)');
  }

  // Check for placeholder values
  if (token.includes('your-') || token.includes('example')) {
    errors.push('DISCORD_TOKEN appears to be a placeholder value from .env.example');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a URL format
 * @param url The URL to validate
 * @param name The name of the environment variable (for error messages)
 * @returns ValidationResult with any errors found
 */
export function validateUrl(url: string | undefined, name: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!url || url.trim() === '') {
    errors.push(`${name} is empty or not set`);
    return { valid: false, errors, warnings };
  }

  try {
    const parsedUrl = new URL(url);

    // Check for valid protocol
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      errors.push(`${name} must use http:// or https:// protocol`);
    }

    // Check for placeholder values
    if (url.includes('your-') || url.includes('example')) {
      errors.push(`${name} appears to be a placeholder value`);
    }
  } catch (error) {
    errors.push(`${name} is not a valid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Prints validation results to console
 * @param result The validation result to print
 * @param throwOnError Whether to throw an error if validation fails
 */
export function printValidationResults(result: ValidationResult, throwOnError = false): void {
  if (result.errors.length > 0) {
    console.error('\n❌ Environment Validation Errors:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.warn('\n⚠️  Environment Validation Warnings:');
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  if (result.valid) {
    console.log('✅ Environment validation passed');
  } else if (throwOnError) {
    throw new Error('Environment validation failed');
  }
}

/**
 * Validates all common required environment variables for the bot
 * @param throwOnError Whether to throw an error if validation fails
 * @returns Combined validation result
 */
export function validateBotEnvironment(throwOnError = false): ValidationResult {
  const results: ValidationResult[] = [];

  // Check required variables exist
  results.push(validateRequiredEnv([
    'DISCORD_TOKEN',
    'SONGBIRD_BASE_URL',
    'SONGBIRD_API_KEY',
    'DATABASE_URL',
  ]));

  // Validate specific formats
  if (process.env.DISCORD_TOKEN) {
    results.push(validateDiscordToken(process.env.DISCORD_TOKEN));
  }

  if (process.env.SONGBIRD_BASE_URL) {
    results.push(validateUrl(process.env.SONGBIRD_BASE_URL, 'SONGBIRD_BASE_URL'));
  }

  if (process.env.DATABASE_URL) {
    results.push(validatePostgresUrl(process.env.DATABASE_URL));
  }

  // Combine all results
  const combined: ValidationResult = {
    valid: results.every(r => r.valid),
    errors: results.flatMap(r => r.errors),
    warnings: results.flatMap(r => r.warnings),
  };

  printValidationResults(combined, throwOnError);

  return combined;
}
