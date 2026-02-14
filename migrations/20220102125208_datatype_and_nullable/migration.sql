-- File: migrations/20220102125208_datatype_and_nullable/migration.sql
-- PostgreSQL version

/*
  Warnings:

  - You are about to alter the column `finishedSetup` on the `Settings` table. The data in that column could be lost. The data in that column will be cast from `SMALLINT` to `Boolean`.
  - Made several columns NOT NULL (will fail if there are existing NULL values)

*/

-- Rename tables and make columns NOT NULL
ALTER TABLE "KeyValueCaches" RENAME TO "KeyValueCache";
ALTER TABLE "KeyValueCache" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "KeyValueCache" ALTER COLUMN "value" SET NOT NULL;
ALTER TABLE "KeyValueCache" ALTER COLUMN "expiresAt" SET NOT NULL;
ALTER TABLE "KeyValueCache" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Shortcuts" RENAME TO "Shortcut";
ALTER TABLE "Shortcut" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Shortcut" ALTER COLUMN "guildId" SET NOT NULL;
ALTER TABLE "Shortcut" ALTER COLUMN "authorId" SET NOT NULL;
ALTER TABLE "Shortcut" ALTER COLUMN "shortcut" SET NOT NULL;
ALTER TABLE "Shortcut" ALTER COLUMN "command" SET NOT NULL;
ALTER TABLE "Shortcut" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Drop old indexes and create new ones
DROP INDEX IF EXISTS "shortcuts_shortcut";
DROP INDEX IF EXISTS "shortcuts_guild_id";
CREATE INDEX "shortcuts_shortcut" ON "Shortcut"("shortcut");
CREATE INDEX "shortcuts_guild_id" ON "Shortcut"("guildId");
CREATE INDEX "Shortcut_guildId_shortcut_idx" ON "Shortcut"("guildId", "shortcut");

ALTER TABLE "FileCaches" RENAME TO "FileCache";
ALTER TABLE "FileCache" ALTER COLUMN "hash" SET NOT NULL;
ALTER TABLE "FileCache" ALTER COLUMN "bytes" SET NOT NULL;
ALTER TABLE "FileCache" ALTER COLUMN "accessedAt" SET NOT NULL;
ALTER TABLE "FileCache" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Settings" RENAME TO "Setting";
ALTER TABLE "Setting" ALTER COLUMN "guildId" SET NOT NULL;
ALTER TABLE "Setting" ALTER COLUMN "prefix" SET NOT NULL;
-- Convert finishedSetup from SMALLINT to BOOLEAN
ALTER TABLE "Setting" ALTER COLUMN "finishedSetup" TYPE BOOLEAN USING (CASE WHEN "finishedSetup" = 0 THEN false ELSE true END);
ALTER TABLE "Setting" ALTER COLUMN "finishedSetup" SET DEFAULT false;
ALTER TABLE "Setting" ALTER COLUMN "playlistLimit" SET DEFAULT 50;
ALTER TABLE "Setting" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
