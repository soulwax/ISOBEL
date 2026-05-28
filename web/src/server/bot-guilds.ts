import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';
import { logger } from '../lib/logger.js';
import { getBotHealthUrl } from './bot-health-url.js';

export interface BotGuild {
  id: string;
  name: string;
  icon: string | null;
}

interface BotHealthWithGuilds {
  guildList?: BotGuild[];
}

const GUILD_CACHE_TTL_MS = 5 * 60_000; // 5 minutes — Discord rate-limits this endpoint aggressively
let cachedBotGuilds: { value: BotGuild[]; expiresAt: number } | null = null;
let pendingBotGuilds: Promise<BotGuild[] | null> | null = null;

function getDiscordTokenFromEnvFiles(): string | null {
  const envPaths = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(dirname(process.cwd()), '.env.local'),
    resolve(dirname(process.cwd()), '.env'),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    const token = parse(readFileSync(envPath)).DISCORD_TOKEN?.trim();
    if (token) {
      return token;
    }
  }

  return null;
}

function getDiscordToken(): string | null {
  return process.env.DISCORD_TOKEN?.trim() || getDiscordTokenFromEnvFiles();
}

function removeCachedBotGuild(guildId: string): void {
  if (!cachedBotGuilds) {
    return;
  }

  cachedBotGuilds = {
    value: cachedBotGuilds.value.filter((guild) => guild.id !== guildId),
    expiresAt: cachedBotGuilds.expiresAt,
  };
}

async function getBotGuildsFromDiscord(): Promise<BotGuild[] | null> {
  const discordToken = getDiscordToken();

  if (!discordToken) {
    return null;
  }

  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        accept: 'application/json',
        Authorization: `Bot ${discordToken}`,
      },
    });

    if (!response.ok) {
      logger.warn('Discord bot guild fetch failed', {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      });
      return null;
    }

    const guilds = await response.json() as BotGuild[];
    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
    }));
  } catch (error) {
    logger.warn('Failed to fetch bot guilds from Discord', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getBotGuildsFromHealth(): Promise<BotGuild[] | null> {
  const botHealthUrl = getBotHealthUrl();

  try {
    const response = await fetch(botHealthUrl, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as BotHealthWithGuilds;
    return Array.isArray(data.guildList) ? data.guildList : null;
  } catch (error) {
    logger.warn('Failed to fetch bot guild list', {
      error: error instanceof Error ? error.message : String(error),
      botHealthUrl,
    });
    return null;
  }
}

export async function getBotGuilds(): Promise<BotGuild[] | null> {
  const now = Date.now();

  if (cachedBotGuilds && cachedBotGuilds.expiresAt > now) {
    return cachedBotGuilds.value;
  }

  pendingBotGuilds ??= (async () => {
    const guilds = await getBotGuildsFromHealth() ?? await getBotGuildsFromDiscord();

    if (guilds) {
      cachedBotGuilds = {
        value: guilds,
        expiresAt: Date.now() + GUILD_CACHE_TTL_MS,
      };
    }

    return guilds;
  })().finally(() => {
    pendingBotGuilds = null;
  });

  return await pendingBotGuilds;
}

export async function leaveBotGuild(guildId: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const discordToken = getDiscordToken();

  if (!discordToken) {
    return {
      ok: false,
      status: 503,
      message: 'Discord bot token is not configured',
    };
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}`, {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        Authorization: `Bot ${discordToken}`,
      },
    });

    if (response.status === 204 || response.status === 404) {
      removeCachedBotGuild(guildId);
      return { ok: true };
    }

    logger.warn('Discord bot guild leave failed', {
      guildId,
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
    });

    return {
      ok: false,
      status: response.status === 429 ? 429 : 502,
      message: response.status === 429
        ? 'Discord is rate limiting this action. Please try again shortly.'
        : 'Discord rejected the leave request',
    };
  } catch (error) {
    logger.warn('Failed to leave Discord guild', {
      guildId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      ok: false,
      status: 502,
      message: 'Failed to contact Discord',
    };
  }
}
