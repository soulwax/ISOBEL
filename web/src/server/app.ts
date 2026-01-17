// File: web/src/server/app.ts

import { config } from 'dotenv';
config();

import { and, eq } from "drizzle-orm";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { handlers } from "../auth/index.js";
import { db } from "../db/index.js";
import {
  discordGuilds,
  discordUsers,
  guildMembers,
  settings,
} from "../db/schema.js";
import { getEnv, validateEnv } from "../lib/env.js";
import { AuthorizationError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { canManageGuildSettings, validateGuildId } from "../lib/utils.js";
import { guildSettingsSchema } from "../lib/validation.js";
import { AuthenticatedRequest, errorHandler, requireAuth } from "./middleware.js";

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

export function createApp() {
  const app = express();
  const FRONTEND_URL = getEnv("NEXTAUTH_URL", "http://localhost:3001");

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
    max: 5, // Stricter for auth endpoints
    message: 'Too many authentication requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
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
    
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // NextAuth API routes - match all paths starting with /api/auth/
  app.all(/^\/api\/auth\/.*/, authLimiter, async (req, res): Promise<void> => {
    try {
      const { GET, POST } = handlers;
      const handler = req.method === "GET" ? GET : POST;

      if (!handler) {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Build full URL using originalUrl which contains the full path
      const protocol = req.protocol || "http";
      const host = req.get("host") || "localhost:3001";
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      // Convert Express req to Next.js Request
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

      const nextReq = new Request(fullUrl, {
        method: req.method,
        headers,
        body,
      }) as Parameters<typeof handler>[0];

      const nextRes = await handler(nextReq);

      // Convert Next.js Response to Express response
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
      logger.error("Auth handler error", { error, path: req.path });
      res.status(500).json({ error: "Internal server error" });
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

      // Get Discord user ID
      const discordUser = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.userId, session.user.id))
        .limit(1);

      if (discordUser.length === 0) {
        res.json({ guilds: [] });
        return;
      }

      const discordUserId = discordUser[0].id;

      // Get all guilds the user is a member of
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

      res.json({ guilds: userGuilds });
    } catch (error) {
      logger.error("Error fetching guilds", { error, userId: (req as AuthenticatedRequest).session?.user?.id });
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

      // Verify user is a member of this guild
      const discordUser = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.userId, session.user.id))
        .limit(1);

      if (discordUser.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

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

      // Verify user is a member of this guild
      const discordUser = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.userId, session.user.id))
        .limit(1);

      if (discordUser.length === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

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

      // Check if user has permission to manage guild settings
      if (!canManageGuildSettings(member[0].permissions)) {
        throw new AuthorizationError("You do not have permission to modify settings");
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

  // Health check endpoint - proxies to the bot's health server
  app.get("/api/health", async (_req, res): Promise<void> => {
    const botHealthUrl = getEnv("BOT_HEALTH_URL", "https://isobelhealth.soulwax.dev");
    
    // Normalize URL: handle trailing slash and /health path
    let healthUrl = botHealthUrl.trim();
    
    // If /health is already in the URL, use it as-is
    if (healthUrl.endsWith('/health')) {
      // Already has /health, use as-is
    } else if (healthUrl.endsWith('/')) {
      // Has trailing slash, append 'health' (no leading slash)
      healthUrl = `${healthUrl}health`;
    } else {
      // No trailing slash, append '/health'
      healthUrl = `${healthUrl}/health`;
    }

    try {
      logger.info(`Fetching bot health from ${healthUrl}`, { 
        botHealthUrl, 
        constructedUrl: healthUrl,
        envVar: process.env.BOT_HEALTH_URL 
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logger.warn("Health check timeout, aborting...", { url: healthUrl });
        controller.abort();
      }, 5000); // 5 second timeout

      const response = await fetch(healthUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'isobel-web/1.0',
        },
      });
      clearTimeout(timeoutId);
      
      logger.info(`Bot health response status: ${response.status}`, { 
        url: healthUrl,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        logger.warn(`Bot health check failed`, {
          url: healthUrl,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 200), // Limit error text length
        });
        res.status(response.status).json({
          status: "error",
          ready: false,
          error: `Bot health check failed with status ${response.status}: ${response.statusText}`,
          url: healthUrl,
        });
        return;
      }

      const data = await response.json();
      logger.debug(`Bot health check successful`, { data });
      res.json(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      
      logger.error("Error checking bot health", { 
        error: errorMessage,
        errorName,
        url: healthUrl,
        botHealthUrl,
        envVar: process.env.BOT_HEALTH_URL,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      res.status(503).json({
        status: "error",
        ready: false,
        error: `Unable to connect to bot health server: ${errorMessage}`,
        url: healthUrl,
        errorName,
      });
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

  // Error handler middleware (must be last)
  app.use(errorHandler);

  return app;
}
