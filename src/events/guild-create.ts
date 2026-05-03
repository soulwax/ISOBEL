// File: src/events/guild-create.ts

import { REST } from '@discordjs/rest';
import { type Setting } from '@prisma/client';
import { type Client, type Guild } from 'discord.js';
import type Command from '../commands/index.js';
import container from '../inversify.config.js';
import type Config from '../services/config.js';
import { TYPES } from '../types.js';
import { prisma } from '../utils/db.js';
import registerCommandsOnGuild from '../utils/register-commands-on-guild.js';

let ensureDiscordGuildTablePromise: Promise<void> | null = null;

async function ensureDiscordGuildTable(): Promise<void> {
  ensureDiscordGuildTablePromise ??= (async () => {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "discord_guild" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "icon" text,
        "iconHash" text,
        "splash" text,
        "discoverySplash" text,
        "ownerId" text NOT NULL,
        "owner" boolean DEFAULT false NOT NULL,
        "permissions" text,
        "region" text,
        "afkChannelId" text,
        "afkTimeout" integer,
        "widgetEnabled" boolean,
        "widgetChannelId" text,
        "verificationLevel" integer,
        "defaultMessageNotifications" integer,
        "explicitContentFilter" integer,
        "roles" text,
        "emojis" text,
        "features" text,
        "mfaLevel" integer,
        "applicationId" text,
        "systemChannelId" text,
        "systemChannelFlags" integer,
        "rulesChannelId" text,
        "maxMembers" integer,
        "maxPresences" integer,
        "vanityUrlCode" text,
        "description" text,
        "banner" text,
        "premiumTier" integer,
        "premiumSubscriptionCount" integer,
        "preferredLocale" text,
        "publicUpdatesChannelId" text,
        "maxVideoChannelUsers" integer,
        "maxStageVideoChannelUsers" integer,
        "approximateMemberCount" integer,
        "approximatePresenceCount" integer,
        "nsfwLevel" integer,
        "joinedAt" timestamp,
        "deletedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `;

    await prisma.$executeRaw`
      ALTER TABLE "discord_guild" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp
    `;
  })();

  await ensureDiscordGuildTablePromise;
}

async function upsertDiscordGuild(guild: Guild): Promise<void> {
  await ensureDiscordGuildTable();

  await prisma.$executeRaw`
    INSERT INTO "discord_guild" (
      "id",
      "name",
      "icon",
      "ownerId",
      "owner",
      "features",
      "preferredLocale",
      "joinedAt",
      "deletedAt",
      "updatedAt"
    )
    VALUES (
      ${guild.id},
      ${guild.name},
      ${guild.icon},
      ${guild.ownerId},
      false,
      ${JSON.stringify([...guild.features])},
      ${guild.preferredLocale},
      ${guild.joinedAt},
      NULL,
      now()
    )
    ON CONFLICT ("id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "icon" = EXCLUDED."icon",
      "ownerId" = EXCLUDED."ownerId",
      "features" = EXCLUDED."features",
      "preferredLocale" = EXCLUDED."preferredLocale",
      "joinedAt" = COALESCE("discord_guild"."joinedAt", EXCLUDED."joinedAt"),
      "deletedAt" = NULL,
      "updatedAt" = now()
  `;
}

export async function registerGuildInDatabase(guild: Guild): Promise<void> {
  await upsertDiscordGuild(guild);
  await createGuildSettings(guild.id);
}

export async function createGuildSettings(guildId: string): Promise<Setting> {
  return prisma.setting.upsert({
    where: {
      guildId,
    },
    create: {
      guildId,
    },
    update: {},
  });
}

export default async (guild: Guild): Promise<void> => {
  await registerGuildInDatabase(guild);

  const config = container.get<Config>(TYPES.Config);

  // Setup slash commands
  if (!config.REGISTER_COMMANDS_ON_BOT) {
    const client = container.get<Client>(TYPES.Client);

    const rest = new REST({version: '10'}).setToken(config.DISCORD_TOKEN);

    await registerCommandsOnGuild({
      rest,
      applicationId: client.user!.id,
      guildId: guild.id,
      commands: container.getAll<Command>(TYPES.Command).map(command => command.slashCommand),
    });
  }
};
