import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';

let setupPromise: Promise<void> | null = null;

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function getConfiguredSuperUserEmails(): string[] {
  return (process.env.SUPERUSER ?? '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter((email): email is string => Boolean(email));
}

function normalizeDiscordId(discordId: string | null | undefined): string | null {
  const normalized = discordId?.trim();
  return normalized || null;
}

function getConfiguredSuperUserDiscordIds(): string[] {
  return (process.env.SUPERUSER_DISCORD_ID ?? '')
    .split(',')
    .map((discordId) => normalizeDiscordId(discordId))
    .filter((discordId): discordId is string => Boolean(discordId));
}

async function setupSuperUserTable(): Promise<void> {
  const tableExists = await db.execute<{ exists: boolean }>(sql`
    SELECT to_regclass('public.super_user') IS NOT NULL AS "exists"
  `);

  if (!tableExists[0]?.exists) {
    await db.execute(sql`
      CREATE TABLE "super_user" (
        "email" text PRIMARY KEY NOT NULL,
        "discordId" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);
  }

  const columns = await db.execute<{ columnName: string; isNullable: 'YES' | 'NO' }>(sql`
    SELECT column_name AS "columnName", is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'super_user'
  `);

  const columnByName = new Map(columns.map((column) => [column.columnName, column]));

  if (!columnByName.has('discordId')) {
    await db.execute(sql`
      ALTER TABLE "super_user" ADD COLUMN "discordId" text
    `);
  }

  for (const legacyColumn of ['passwordHash', 'passwordSalt']) {
    if (columnByName.get(legacyColumn)?.isNullable === 'NO') {
      await db.execute(sql`
        ALTER TABLE "super_user" ALTER COLUMN ${sql.identifier(legacyColumn)} DROP NOT NULL
      `);
    }
  }

  const emails = getConfiguredSuperUserEmails();
  const discordIds = getConfiguredSuperUserDiscordIds();

  for (const [index, email] of emails.entries()) {
    const discordId = discordIds[index] ?? discordIds[0] ?? null;

    await db.execute(sql`
      INSERT INTO "super_user" ("email", "discordId", "updatedAt")
      VALUES (${email}, ${discordId}, now())
      ON CONFLICT ("email") DO UPDATE SET
        "discordId" = excluded."discordId",
        "updatedAt" = now()
    `);
  }
}

export async function ensureSuperUserTable(): Promise<void> {
  setupPromise ??= setupSuperUserTable().catch((error) => {
    setupPromise = null;
    logger.error('Failed to initialize super_user table', { error });
    throw error;
  });

  return setupPromise;
}

export async function isSuperUserIdentity({
  email,
  discordId,
}: {
  email?: string | null;
  discordId?: string | null;
}): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedDiscordId = normalizeDiscordId(discordId);

  if (!normalizedEmail && !normalizedDiscordId) {
    return false;
  }

  await ensureSuperUserTable();

  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM "super_user"
      WHERE (${normalizedEmail}::text IS NOT NULL AND "email" = ${normalizedEmail})
        OR (${normalizedDiscordId}::text IS NOT NULL AND "discordId" = ${normalizedDiscordId})
    ) AS "exists"
  `);

  return rows[0]?.exists === true;
}
