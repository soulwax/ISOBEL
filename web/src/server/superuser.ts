import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';

const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = 'sha256';

let setupPromise: Promise<void> | null = null;

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST
  ).toString('hex');

  return { hash, salt };
}

async function setupSuperUserTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "super_user" (
      "email" text PRIMARY KEY NOT NULL,
      "passwordHash" text NOT NULL,
      "passwordSalt" text NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )
  `);

  const email = normalizeEmail(process.env.SUPERUSER);
  const password = process.env.SUPERUSER_PASSWORD?.trim();

  if (!email || !password) {
    return;
  }

  const { hash, salt } = hashPassword(password);

  await db.execute(sql`
    INSERT INTO "super_user" ("email", "passwordHash", "passwordSalt", "updatedAt")
    VALUES (${email}, ${hash}, ${salt}, now())
    ON CONFLICT ("email") DO UPDATE SET
      "passwordHash" = excluded."passwordHash",
      "passwordSalt" = excluded."passwordSalt",
      "updatedAt" = now()
  `);
}

export async function ensureSuperUserTable(): Promise<void> {
  setupPromise ??= setupSuperUserTable().catch((error) => {
    setupPromise = null;
    logger.error('Failed to initialize super_user table', { error });
    throw error;
  });

  return setupPromise;
}

export async function isSuperUserEmail(email: string | null | undefined): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  await ensureSuperUserTable();

  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM "super_user" WHERE "email" = ${normalizedEmail}
    ) AS "exists"
  `);

  return rows[0]?.exists === true;
}
