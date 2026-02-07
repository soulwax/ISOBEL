// File: web/src/server/middleware.ts

import express from 'express';
import { handlers } from '../auth/index.js';
import { AuthenticationError, AuthorizationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Session data attached to Express request
 */
export interface AuthenticatedRequest extends express.Request {
  session?: {
    user: {
      id: string;
      discordId?: string;
      name?: string;
      email?: string;
      image?: string;
    };
    expires?: string;
  };
}

/**
 * Get session from NextAuth request
 */
async function getSessionFromRequest(req: express.Request): Promise<AuthenticatedRequest['session'] | null> {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3001';
  const fullUrl = `${protocol}://${host}/api/auth/session`;

  const headers = new Headers();
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  });

  const nextReq = new Request(fullUrl, {
    method: 'GET',
    headers,
  }) as Parameters<typeof handlers.GET>[0];

  // Auth.js expects a Next.js-style request carrying nextUrl.
  (nextReq as unknown as { nextUrl: URL }).nextUrl = new URL(fullUrl);

  try {
    const sessionResponse = await handlers.GET(nextReq);
    const sessionText = await sessionResponse.text();
    return sessionText ? JSON.parse(sessionText) : null;
  } catch (error) {
    logger.error('Error fetching session', { error });
    return null;
  }
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  try {
    const session = await getSessionFromRequest(req);
    
    if (!session?.user?.id) {
      throw new AuthenticationError('Authentication required');
    }

    (req as AuthenticatedRequest).session = session;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({ error: error.message });
      return;
    }
    logger.error('Auth middleware error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Error handler middleware
 */
export function errorHandler(
  error: unknown,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction
): void {
  if (error instanceof AuthenticationError) {
    res.status(401).json({ error: error.message });
    return;
  }

  if (error instanceof AuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }

  // Log unexpected errors
  logger.error('Unhandled error', { error, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal server error' });
}
