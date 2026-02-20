-- File: migrations/20220101155430_migrate_from_sequelize/migration.sql
-- CreateTable (PostgreSQL syntax)

CREATE TABLE "FileCaches" ("hash" VARCHAR(255) UNIQUE PRIMARY KEY, "bytes" INTEGER, "accessedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL);

-- CreateTable
CREATE TABLE "KeyValueCaches" ("key" VARCHAR(255) UNIQUE PRIMARY KEY, "value" TEXT, "expiresAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL);

-- CreateTable
CREATE TABLE "Settings" ("guildId" VARCHAR(255) UNIQUE PRIMARY KEY, "prefix" VARCHAR(255), "channel" VARCHAR(255), "finishedSetup" SMALLINT DEFAULT 0, "playlistLimit" INTEGER DEFAULT 50, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL);

-- CreateTable
CREATE TABLE "Shortcuts" ("id" SERIAL PRIMARY KEY, "guildId" VARCHAR(255), "authorId" VARCHAR(255), "shortcut" VARCHAR(255), "command" VARCHAR(255), "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shortcuts_shortcut" ON "Shortcuts"("shortcut");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shortcuts_guild_id" ON "Shortcuts"("guildId");
