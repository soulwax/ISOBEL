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
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "super_user" (
      "email" text PRIMARY KEY NOT NULL,
      "discordId" text,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TABLE "super_user" ADD COLUMN IF NOT EXISTS "discordId" text;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'super_user'
          AND column_name = 'passwordHash'
      ) THEN
        ALTER TABLE "super_user" ALTER COLUMN "passwordHash" DROP NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'super_user'
          AND column_name = 'passwordSalt'
      ) THEN
        ALTER TABLE "super_user" ALTER COLUMN "passwordSalt" DROP NOT NULL;
      END IF;
    END $$;
  `);

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
