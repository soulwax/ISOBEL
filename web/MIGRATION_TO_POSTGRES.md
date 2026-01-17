# Migration from SQLite to PostgreSQL (Neon)

## Overview

The database has been migrated from SQLite (better-sqlite3) to PostgreSQL using Neon.

## Changes Made

### 1. Dependencies
- **Removed:** `better-sqlite3`, `@types/better-sqlite3`
- **Added:** `postgres` (PostgreSQL client for Node.js)

### 2. Database Configuration
- **File:** `drizzle.config.ts`
  - Changed `dialect` from `'sqlite'` to `'postgresql'`
  - Updated `dbCredentials` to use `DATABASE_URL` or `POSTGRES_URL` from environment

### 3. Schema Conversion
- **File:** `src/db/schema.ts`
  - Changed from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core`
  - Converted `sqliteTable` to `pgTable`
  - Converted `integer` with `mode: 'timestamp'` to `timestamp` with `mode: 'date'`
  - Converted `integer` with `mode: 'boolean'` to `boolean`
  - Updated default functions from `$defaultFn(() => new Date())` to `defaultNow()`

### 4. Database Connection
- **File:** `src/db/index.ts`
  - Changed from `drizzle-orm/better-sqlite3` to `drizzle-orm/postgres-js`
  - Replaced SQLite connection with PostgreSQL connection using `postgres` client
  - Added connection pooling configuration

### 5. Migration Script
- **File:** `scripts/migrate.ts`
  - Updated to use PostgreSQL migrator
  - Changed connection handling for PostgreSQL

## Environment Variables

The following environment variables are used (in order of preference):

1. `DATABASE_URL` - Primary database connection string
2. `POSTGRES_URL` - Alternative database connection string

Both should be PostgreSQL connection strings in the format:
```
postgresql://user:password@host:port/database?sslmode=require
```

## Migration Steps

### 1. Install Dependencies
```bash
npm install
```

This will install the `postgres` package and remove `better-sqlite3`.

### 2. Set Environment Variables
Ensure your `.env` file contains:
```env
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

Or use `POSTGRES_URL` if preferred.

### 3. Generate Migrations
```bash
npm run db:generate
```

This will create new PostgreSQL migration files in the `./drizzle` directory.

### 4. Run Migrations
```bash
npm run db:migrate
```

This will apply all migrations to your Neon PostgreSQL database.

### 5. Verify Connection
You can verify the connection works by running:
```bash
npm run db:studio
```

This will open Drizzle Studio connected to your PostgreSQL database.

## Important Notes

### Data Migration
⚠️ **Important:** This migration does NOT automatically migrate existing SQLite data to PostgreSQL. If you have existing data:

1. Export data from SQLite (if needed)
2. Import data into PostgreSQL manually or using a migration script
3. Or start fresh with the new PostgreSQL database

### Connection Pooling
The PostgreSQL connection uses connection pooling:
- Maximum 10 connections
- Idle timeout: 20 seconds
- Connection timeout: 10 seconds

### SSL Mode
Neon requires SSL connections. The connection string should include `?sslmode=require`.

## Rollback

If you need to rollback to SQLite:

1. Revert the changes in:
   - `package.json`
   - `drizzle.config.ts`
   - `src/db/schema.ts`
   - `src/db/index.ts`
   - `scripts/migrate.ts`

2. Reinstall SQLite dependencies:
   ```bash
   npm install better-sqlite3 @types/better-sqlite3
   ```

3. Restore the SQLite database file if needed

## Testing

After migration, test the following:

1. **Database Connection:**
   ```bash
   npm run db:studio
   ```

2. **Application Startup:**
   ```bash
   npm run dev:auth
   ```

3. **Authentication Flow:**
   - Sign in with Discord
   - Verify user data is saved
   - Check guild data is fetched and stored

## Troubleshooting

### Connection Errors
- Verify `DATABASE_URL` is set correctly
- Check SSL mode is `require` for Neon
- Ensure network access is allowed in Neon dashboard

### Migration Errors
- Check that all previous migrations have been applied
- Verify database permissions
- Check for conflicting table names

### Type Errors
- Ensure all schema types are correctly converted
- Check that `defaultNow()` is used instead of `$defaultFn(() => new Date())`
- Verify boolean fields use `boolean()` instead of `integer()` with mode

## Support

For issues related to:
- **Neon Database:** Check Neon dashboard and documentation
- **Drizzle ORM:** Check Drizzle documentation for PostgreSQL
- **Connection Issues:** Verify environment variables and network access
