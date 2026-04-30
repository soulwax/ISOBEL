// File: web/src/server/app.ts

import { loadEnvWithSafeguard } from '../lib/load-env.js';
loadEnvWithSafeguard();

import { join } from 'path';
import { and, eq, isNull, sql } from "drizzle-orm";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
// Lazy import handlers to avoid initialization errors at module load time
// import { handlers } from "../auth/index.js";
import { syncDiscordData } from "../auth/discord-sync.js";
import { db } from "../db/index.js";
import {
  accounts,
  discordGuilds,
  discordUsers,
  guildOrderPreferences,
  guildMembers,
  settings,
} from "../db/schema.js";
import { getEnv, validateEnv } from "../lib/env.js";
import { AuthorizationError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { hasAdministratorPermission, validateGuildId } from "../lib/utils.js";
import { guildSettingsSchema } from "../lib/validation.js";
import { getBotHealthUrl } from "./bot-health-url.js";
import { getBotGuilds, leaveBotGuild, type BotGuild } from "./bot-guilds.js";
import { AuthenticatedRequest, errorHandler, requireAuth } from "./middleware.js";
import { ensureSuperUserTable, isSuperUserIdentity } from "./superuser.js";

// Validate environment variables at startup (only in non-Vercel environments)
if (process.env.VERCEL !== '1') {
  try {
    validateEnv();
  } catch (error) {
    logger.error("Environment validation failed", { error });
    // Don't exit in Vercel environment
    if (process.env.VERCEL !== '1') {
      process.exit(1);
    }
  }
}

export interface CreateAppOptions {
  /** Serve static build and SPA fallback from this directory (single-process production). */
  serveStatic?: boolean;
  /** Directory containing the built frontend (default: process.cwd() + '/build'). */
  buildDir?: string;
}

interface BotHealthResponse {
  status: "ok" | "not_ready" | "error";
  ready: boolean;
  guilds?: number;
  uptime?: number;
  uptimeFormatted?: string;
  timestamp?: string;
}

async function isSessionSuperUser(session: AuthenticatedRequest["session"]): Promise<boolean> {
  if (!session?.user?.id) {
    return false;
  }

  const discordUser = await db
    .select({
      id: discordUsers.id,
      email: discordUsers.email,
    })
    .from(discordUsers)
    .where(eq(discordUsers.userId, session.user.id))
    .limit(1);

  return await isSuperUserIdentity({
    email: session.user.email ?? discordUser[0]?.email,
    discordId: session.user.discordId ?? discordUser[0]?.id,
  });
}

function getTrustProxySetting(): number | boolean {
  if (process.env.VERCEL) {
    return 1;
  }

  const configuredValue = process.env.TRUST_PROXY?.trim().toLowerCase();

  if (!configuredValue || configuredValue === "false" || configuredValue === "0") {
    return false;
  }

  if (configuredValue === "true") {
    return 1;
  }

  const proxyHops = Number.parseInt(configuredValue, 10);
  return Number.isNaN(proxyHops) ? 1 : proxyHops;
}

async function ensureDiscordGuildDeletedAtColumn(): Promise<void> {
  const columns = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'discord_guild'
        AND column_name = 'deletedAt'
    ) AS "exists"
  `);

  if (!columns[0]?.exists) {
    await db.execute(sql`
      ALTER TABLE "discord_guild" ADD COLUMN "deletedAt" timestamp
    `);
  }
}

async function ensureGuildOrderPreferenceTable(): Promise<void> {
  const tableExists = await db.execute<{ exists: boolean }>(sql`
    SELECT to_regclass('public.guild_order_preference') IS NOT NULL AS "exists"
  `);

  if (!tableExists[0]?.exists) {
    await db.execute(sql`
      CREATE TABLE "guild_order_preference" (
        "userId" text PRIMARY KEY NOT NULL,
        "guildOrder" text DEFAULT '[]' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);
  }

  const constraintExists = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'guild_order_preference'
        AND constraint_name = 'guild_order_preference_userId_user_id_fk'
    ) AS "exists"
  `);

  if (!constraintExists[0]?.exists) {
    await db.execute(sql`
      ALTER TABLE "guild_order_preference"
      ADD CONSTRAINT "guild_order_preference_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action
    `);
  }
}

function normalizeGuildOrder(guildOrder: unknown): string[] {
  if (!Array.isArray(guildOrder)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of guildOrder) {
    if (typeof value !== "string" || !validateGuildId(value) || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

async function getGuildOrderPreference(userId: string): Promise<string[]> {
  await ensureGuildOrderPreferenceTable();

  const rows = await db
    .select({ guildOrder: guildOrderPreferences.guildOrder })
    .from(guildOrderPreferences)
    .where(eq(guildOrderPreferences.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    return [];
  }

  try {
    return normalizeGuildOrder(JSON.parse(rows[0].guildOrder));
  } catch {
    return [];
  }
}

function applyGuildOrder<T extends { id: string }>(guilds: T[], guildOrder: string[]): T[] {
  if (guildOrder.length === 0) {
    return guilds;
  }

  const indexByGuildId = new Map(guildOrder.map((guildId, index) => [guildId, index]));

  return [...guilds].sort((left, right) => {
    const leftIndex = indexByGuildId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = indexByGuildId.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return 0;
  });
}

async function ensureDiscordGuildRow(guildId: string, botGuilds: BotGuild[] | null): Promise<boolean> {
  const existingGuild = await db
    .select({ id: discordGuilds.id })
    .from(discordGuilds)
    .where(eq(discordGuilds.id, guildId))
    .limit(1);

  if (existingGuild.length > 0) {
    return true;
  }

  const botGuild = botGuilds?.find((guild) => guild.id === guildId);

  if (!botGuild) {
    return false;
  }

  await db
    .insert(discordGuilds)
    .values({
      id: botGuild.id,
      name: botGuild.name,
      icon: botGuild.icon,
      ownerId: "",
      owner: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: discordGuilds.id,
      set: {
        name: botGuild.name,
        icon: botGuild.icon,
        deletedAt: null,
        updatedAt: new Date(),
      },
    });

  return true;
}

async function getDeletedGuildIds(): Promise<Set<string>> {
  await ensureDiscordGuildDeletedAtColumn();

  const deletedGuilds = await db
    .select({ id: discordGuilds.id })
    .from(discordGuilds)
    .where(sql`${discordGuilds.deletedAt} IS NOT NULL`);

  return new Set(deletedGuilds.map((guild) => guild.id));
}

async function reconcileDeletedBotGuilds(botGuilds: BotGuild[] | null): Promise<void> {
  if (!botGuilds) {
    return;
  }

  await ensureDiscordGuildDeletedAtColumn();

  const liveGuildIds = botGuilds.map((guild) => guild.id);

  if (liveGuildIds.length === 0) {
    await db.execute(sql`
      UPDATE "discord_guild"
      SET "deletedAt" = COALESCE("deletedAt", now()),
          "updatedAt" = now()
      WHERE "deletedAt" IS NULL
    `);
    return;
  }

  const liveGuildIdValues = sql.join(liveGuildIds.map((guildId) => sql`${guildId}`), sql`, `);

  await db.execute(sql`
    UPDATE "discord_guild"
    SET "deletedAt" = COALESCE("deletedAt", now()),
        "updatedAt" = now()
    WHERE "deletedAt" IS NULL
      AND "id" NOT IN (${liveGuildIdValues})
  `);
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (isLocalHostname(url.hostname)) {
      url.protocol = "http:";
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const { serveStatic = false, buildDir = join(process.cwd(), 'build') } = options;
  const FRONTEND_URL = getEnv("NEXTAUTH_URL", "http://localhost:3001");
  const PUBLIC_AUTH_ORIGIN = getOrigin(FRONTEND_URL);
  void ensureSuperUserTable();
  void ensureDiscordGuildDeletedAtColumn();
  void ensureGuildOrderPreferenceTable();

  // Trust only explicitly configured proxy hops so auth callbacks and
  // rate-limiting use forwarded headers when running behind Vercel, Vite,
  // nginx, or another reverse proxy.
  const trustProxy = getTrustProxySetting();
  if (trustProxy) {
    app.set('trust proxy', trustProxy);
  }

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Minimize unsafe-inline in production
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "https://cdn.discordapp.com", "data:"],
      },
    },
  }));

  // Request size limits
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Rate limiting (use memory store for Vercel)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: process.env.VERCEL ? undefined : undefined, // Use default memory store
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Session and CSRF polling happen frequently in the client; keep limits for auth actions.
    skip: (req) => req.path.endsWith('/session') || req.path.endsWith('/csrf') || req.path.endsWith('/providers'),
  });

  // CORS middleware - improved security
  app.use((req, res, next): void => {
    const origin = req.headers.origin;
    
    // Define allowed origins based on environment
    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [FRONTEND_URL] // Strict in production
      : [
          FRONTEND_URL,
          "http://localhost:3001",
          "http://localhost:3000",
          "http://127.0.0.1:3001",
          "http://127.0.0.1:3000",
        ];
    
    // In development, be more permissive: allow any localhost origin or requests without origin
    if (process.env.NODE_ENV === "development") {
      if (origin) {
        // In development, allow any localhost origin (any port)
        if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
          res.header("Access-Control-Allow-Origin", origin);
        } else if (allowedOrigins.includes(origin)) {
          res.header("Access-Control-Allow-Origin", origin);
        } else {
          // Reject non-localhost origins in development
          res.status(403).json({ error: "Origin not allowed" });
          return;
        }
      } else {
        // Allow requests without origin in development (e.g., Vite proxy, curl, same-origin)
        // Set to wildcard for development to allow all proxied requests
        res.header("Access-Control-Allow-Origin", "*");
      }
    } else {
      // Production: strict origin checking
      if (origin && allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
      } else if (!origin) {
        // Allow requests without origin (same-origin requests, server-to-server)
        res.header("Access-Control-Allow-Origin", "*");
      } else {
        // Reject unknown origins in production
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
    }
    
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Auth.js API routes - match all paths starting with /api/auth/
  app.all(/^\/api\/auth\/.*/, authLimiter, async (req, res): Promise<void> => {
    try {
      // Lazy import handlers to avoid initialization errors at module load time
      let handlers;
      try {
        const authModule = await import("../auth/index.js");
        handlers = authModule.handlers;
      } catch (importError) {
        const errorMessage = importError instanceof Error ? importError.message : String(importError);
        const errorStack = importError instanceof Error ? importError.stack : undefined;
        logger.error("Failed to import auth handlers", { 
          error: errorMessage,
          stack: errorStack,
        });
        res.status(500).json({ 
          error: "Authentication service unavailable",
          ...(process.env.NODE_ENV === 'development' && { details: errorMessage })
        });
        return;
      }

      if (!handlers) {
        logger.error("Handlers not available");
        res.status(500).json({ error: "Authentication handlers not initialized" });
        return;
      }

      const { GET, POST } = handlers;
      const handler = req.method === "GET" ? GET : POST;

      if (!handler) {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Build the public URL Auth.js should use for OAuth callbacks. The API
      // may be reached through an internal port like localhost:3003, but
      // Discord must receive the browser-facing origin from NEXTAUTH_URL.
      const host = req.get("x-forwarded-host") || req.get("host") || "localhost:3001";
      const forwardedProtocol = req.get("x-forwarded-proto") || req.protocol || "https";
      const hostname = host.split(":")[0] ?? host;
      const protocol = isLocalHostname(hostname) ? "http" : forwardedProtocol;
      const requestOrigin = PUBLIC_AUTH_ORIGIN ?? `${protocol}://${host}`;
      const fullUrl = `${requestOrigin}${req.originalUrl}`;

      // Convert Express req to Web Request for Auth.js
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      });

      let body: string | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (req.is("application/json")) {
          body = JSON.stringify(req.body);
        } else if (req.is("application/x-www-form-urlencoded")) {
          body = new URLSearchParams(
            req.body as Record<string, string>
          ).toString();
        }
      }

      const authReq = new Request(fullUrl, {
        method: req.method,
        headers,
        body,
      }) as Parameters<typeof handler>[0];

      const nextRes = await handler(authReq);

      // Convert Auth.js Web Response to Express response
      const bodyText = await nextRes.text();
      res.status(nextRes.status);

      // Copy headers, handling Set-Cookie specially
      nextRes.headers.forEach((value: string, key: string) => {
        if (key.toLowerCase() === "set-cookie") {
          // Set-Cookie headers need special handling
          const cookies = nextRes.headers.getSetCookie();
          cookies.forEach((cookie: string) => {
            res.append("Set-Cookie", cookie);
          });
        } else {
          res.setHeader(key, value);
        }
      });

      res.send(bodyText);
    } catch (error) {
      // Enhanced error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error("Auth handler error", { 
        error: errorMessage,
        stack: errorStack,
        path: req.path,
        method: req.method,
        url: req.originalUrl,
      });
      
      // Send more detailed error in development
      if (process.env.NODE_ENV === 'development') {
        res.status(500).json({ 
          error: "Internal server error",
          message: errorMessage,
          path: req.path,
        });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.get("/api/bot-health", apiLimiter, async (_req, res): Promise<void> => {
    const botHealthUrl = getBotHealthUrl();

    try {
      const upstreamResponse = await fetch(botHealthUrl, {
        headers: {
          accept: "application/json",
        },
      });

      const data = await upstreamResponse.json() as BotHealthResponse;

      res.setHeader("Cache-Control", "no-store");
      res.status(upstreamResponse.status).json(data);
    } catch (error) {
      logger.warn("Bot health proxy request failed", {
        error: error instanceof Error ? error.message : String(error),
        botHealthUrl,
      });
      res.status(503).json({
        status: "error",
        ready: false,
      } satisfies BotHealthResponse);
    }
  });

  // API endpoint to get user's Discord guilds
  app.get("/api/guilds", apiLimiter, requireAuth, async (req, res): Promise<void> => {
    try {
      const session = (req as AuthenticatedRequest).session;
      if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const isSuperUser = await isSessionSuperUser(session);
      const botGuilds = await getBotGuilds();
      await reconcileDeletedBotGuilds(botGuilds);
      const deletedGuildIds = await getDeletedGuildIds();
      const guildOrder = await getGuildOrderPreference(session.user.id);
      const botGuildIds = botGuilds ? new Set(botGuilds.map((guild) => guild.id)) : null;
      const botGuildById = botGuilds
        ? new Map(botGuilds.map((guild) => [guild.id, guild]))
        : null;

      if (isSuperUser) {
        if (botGuilds) {
          res.json({
            guilds: applyGuildOrder(
              botGuilds.filter((guild) => !deletedGuildIds.has(guild.id)),
              guildOrder
            ),
          });
          return;
        }

        const storedGuilds = await db
          .select({
            id: discordGuilds.id,
            name: discordGuilds.name,
            icon: discordGuilds.icon,
          })
          .from(discordGuilds)
          .where(isNull(discordGuilds.deletedAt));

        res.json({ guilds: applyGuildOrder(storedGuilds, guildOrder) });
        return;
      }

      // Get Discord user ID
      let discordUser = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.userId, session.user.id))
        .limit(1);

      if (discordUser.length === 0) {
        const discordAccount = await db
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, session.user.id),
              eq(accounts.provider, 'discord')
            )
          )
          .limit(1);

        if (discordAccount.length > 0 && discordAccount[0].access_token) {
          try {
            await syncDiscordData({
              authUserId: session.user.id,
              discordUserId: discordAccount[0].providerAccountId,
              accessToken: discordAccount[0].access_token,
            });
          } catch (error) {
            logger.warn("Failed to refresh Discord guild cache", {
              error: error instanceof Error ? error.message : String(error),
              userId: session.user.id,
            });
          }

          discordUser = await db
            .select()
            .from(discordUsers)
            .where(eq(discordUsers.userId, session.user.id))
            .limit(1);
        }
      }

      if (discordUser.length === 0) {
        res.json({ guilds: [] });
        return;
      }

      const discordUserId = discordUser[0].id;

      // Get only guilds where the user has Discord's ADMINISTRATOR permission.
      const userGuilds = await db
        .select({
          id: discordGuilds.id,
          name: discordGuilds.name,
          icon: discordGuilds.icon,
          permissions: guildMembers.permissions,
        })
        .from(guildMembers)
        .innerJoin(discordGuilds, eq(guildMembers.guildId, discordGuilds.id))
        .where(eq(guildMembers.userId, discordUserId));

      const manageableGuilds = userGuilds
        .filter((guild) => hasAdministratorPermission(guild.permissions))
        .filter((guild) => !deletedGuildIds.has(guild.id))
        .filter((guild) => !botGuildIds || botGuildIds.has(guild.id))
        .map((guild) => {
          const botGuild = botGuildById?.get(guild.id);
          return {
            ...guild,
            name: botGuild?.name ?? guild.name,
            icon: botGuild?.icon ?? guild.icon,
          };
        });

      res.json({
        guilds: applyGuildOrder(manageableGuilds, guildOrder),
      });
    } catch (error) {
      logger.error("Error fetching guilds", { error, userId: (req as AuthenticatedRequest).session?.user?.id });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/guilds/:guildId", apiLimiter, requireAuth, async (req, res): Promise<void> => {
    const guildId = req.params.guildId as string;

    try {
      if (!validateGuildId(guildId)) {
        res.status(400).json({ error: "Invalid guild ID format" });
        return;
      }

      const session = (req as AuthenticatedRequest).session;
      if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const isSuperUser = await isSessionSuperUser(session);
      if (!isSuperUser) {
        throw new AuthorizationError("Only superusers can make the bot leave a server");
      }

      const botGuilds = await getBotGuilds();
      await ensureDiscordGuildRow(guildId, botGuilds);

      const leaveResult = await leaveBotGuild(guildId);
      if (!leaveResult.ok) {
        res.status(leaveResult.status).json({ error: leaveResult.message });
        return;
      }

      const botGuild = botGuilds?.find((guild) => guild.id === guildId);
      const deletedAt = new Date();
      await db
        .insert(discordGuilds)
        .values({
          id: guildId,
          name: botGuild?.name ?? `Deleted server ${guildId}`,
          icon: botGuild?.icon ?? null,
          ownerId: "",
          owner: false,
          deletedAt,
          updatedAt: deletedAt,
        })
        .onConflictDoUpdate({
          target: discordGuilds.id,
          set: {
            name: botGuild?.name ?? sql`${discordGuilds.name}`,
            icon: botGuild?.icon ?? sql`${discordGuilds.icon}`,
            deletedAt,
            updatedAt: deletedAt,
          },
        });

      res.json({ ok: true });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(403).json({ error: error.message });
        return;
      }

      logger.error("Error leaving guild", { error, guildId });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/guilds/order", apiLimiter, requireAuth, async (req, res): Promise<void> => {
    try {
      const session = (req as AuthenticatedRequest).session;
      if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const guildOrder = normalizeGuildOrder((req.body as { guildOrder?: unknown }).guildOrder);
      await ensureGuildOrderPreferenceTable();

      await db
        .insert(guildOrderPreferences)
        .values({
          userId: session.user.id,
          guildOrder: JSON.stringify(guildOrder),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: guildOrderPreferences.userId,
          set: {
            guildOrder: JSON.stringify(guildOrder),
            updatedAt: new Date(),
          },
        });

      res.json({ guildOrder });
    } catch (error) {
      logger.error("Error saving guild order", { error, userId: (req as AuthenticatedRequest).session?.user?.id });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // API endpoint to get guild settings
  app.get("/api/guilds/:guildId/settings", apiLimiter, requireAuth, async (req, res): Promise<void> => {
    try {
      const guildId = req.params.guildId as string;

      // Validate guild ID format
      if (!validateGuildId(guildId)) {
        res.status(400).json({ error: "Invalid guild ID format" });
        return;
      }

      const session = (req as AuthenticatedRequest).session;
      if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const isSuperUser = await isSessionSuperUser(session);
      const botGuilds = await getBotGuilds();

      if (botGuilds && !botGuilds.some((guild) => guild.id === guildId)) {
        res.status(404).json({ error: "Server is not managed by this bot" });
        return;
      }

      const deletedGuildIds = await getDeletedGuildIds();
      if (deletedGuildIds.has(guildId)) {
        res.status(404).json({ error: "Server is not managed by this bot" });
        return;
      }

      // Verify user is a member of this guild
      const discordUser = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.userId, session.user.id))
        .limit(1);

      if (!isSuperUser && discordUser.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (!isSuperUser) {
        const member = await db
          .select()
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, guildId),
              eq(guildMembers.userId, discordUser[0].id)
            )
          )
          .limit(1);

        if (member.length === 0) {
          res.status(403).json({ error: "You are not a member of this server" });
          return;
        }

        if (!hasAdministratorPermission(member[0].permissions)) {
          throw new AuthorizationError("You must be a server administrator to view settings");
        }
      }

      const guildRowExists = await ensureDiscordGuildRow(guildId, botGuilds);
      if (!guildRowExists) {
        res.status(botGuilds ? 404 : 503).json({
          error: botGuilds
            ? "Server is not managed by this bot"
            : "Unable to verify this server with Discord right now",
        });
        return;
      }

      // Get or create default settings
      let guildSettings = await db
        .select()
        .from(settings)
        .where(eq(settings.guildId, guildId))
        .limit(1);

      if (guildSettings.length === 0) {
        // Create default settings and return them directly
        const inserted = await db.insert(settings).values({ guildId }).returning();
        guildSettings = inserted;
      }

      if (guildSettings.length === 0) {
        throw new NotFoundError("Failed to retrieve guild settings");
      }

      res.json({ settings: guildSettings[0] });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error("Error fetching guild settings", { error, guildId: req.params.guildId });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // API endpoint to update guild settings
  app.post("/api/guilds/:guildId/settings", apiLimiter, requireAuth, async (req, res): Promise<void> => {
    try {
      const guildId = req.params.guildId as string;

      // Validate guild ID format
      if (!validateGuildId(guildId)) {
        res.status(400).json({ error: "Invalid guild ID format" });
        return;
      }

      // Validate request body
      const validationResult = guildSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ 
          error: "Invalid settings data", 
          details: validationResult.error.errors 
        });
        return;
      }

      const updates = validationResult.data;

      const session = (req as AuthenticatedRequest).session;
      if (!session?.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const isSuperUser = await isSessionSuperUser(session);
      const botGuilds = await getBotGuilds();

      if (botGuilds && !botGuilds.some((guild) => guild.id === guildId)) {
        res.status(404).json({ error: "Server is not managed by this bot" });
        return;
      }

      const deletedGuildIds = await getDeletedGuildIds();
      if (deletedGuildIds.has(guildId)) {
        res.status(404).json({ error: "Server is not managed by this bot" });
        return;
      }

      // Verify user is a member of this guild
      const discordUser = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.userId, session.user.id))
        .limit(1);

      if (!isSuperUser && discordUser.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (!isSuperUser) {
        const member = await db
          .select()
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, guildId),
              eq(guildMembers.userId, discordUser[0].id)
            )
          )
          .limit(1);

        if (member.length === 0) {
          res.status(403).json({ error: "You are not a member of this server" });
          return;
        }

        if (!hasAdministratorPermission(member[0].permissions)) {
          throw new AuthorizationError("You must be a server administrator to modify settings");
        }
      }

      const guildRowExists = await ensureDiscordGuildRow(guildId, botGuilds);
      if (!guildRowExists) {
        res.status(botGuilds ? 404 : 503).json({
          error: botGuilds
            ? "Server is not managed by this bot"
            : "Unable to verify this server with Discord right now",
        });
        return;
      }

      // Check if settings exist, create if not
      const existing = await db
        .select()
        .from(settings)
        .where(eq(settings.guildId, guildId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(settings).values({ guildId });
      }

      // Update settings
      await db
        .update(settings)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(settings.guildId, guildId));

      // Return updated settings
      const updated = await db
        .select()
        .from(settings)
        .where(eq(settings.guildId, guildId))
        .limit(1);

      if (updated.length === 0) {
        throw new NotFoundError("Failed to retrieve updated settings");
      }

      res.json({ settings: updated[0] });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error("Error updating guild settings", { error, guildId: req.params.guildId });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Web server health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "isobel-web",
    });
  });

  // Optional: serve static build + SPA fallback (single-process deployment)
  if (serveStatic) {
    app.use(express.static(buildDir));
    app.use((_req, res) => {
      res.sendFile(join(buildDir, 'index.html'));
    });
  }

  // Error handler middleware (must be last)
  app.use(errorHandler);

  return app;
}
