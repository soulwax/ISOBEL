// File: web/api/index.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Create Express app instance (singleton for warm starts)
let app: any = null;
let appError: Error | null = null;

async function getApp() {
  if (appError) {
    throw appError;
  }
  if (!app) {
    try {
      // Vercel runs the compiled JS in Node ESM mode; keep the `.js` extension so runtime resolution works.
      const { createApp } = await import('../src/server/app.js');
      app = createApp();
    } catch (error) {
      appError = error instanceof Error ? error : new Error(String(error));
      throw appError;
    }
  }
  return app;
}

function sendError(res: VercelResponse, error: unknown, context: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message;
  const stack = err.stack;

  console.error(`${context}:`, message);
  if (stack) console.error(stack);

  // In production on Vercel, surface the message so you can fix config (env vars, DB, etc.)
  // without having to dig in function logs. Many failures are missing env vars.
  const isVercel = process.env.VERCEL === '1';
  const isDev = process.env.NODE_ENV === 'development';
  const exposeMessage = isVercel || isDev;

  res.status(500).json({
    error: 'Internal server error',
    message: exposeMessage ? message : 'Service unavailable',
    ...(exposeMessage && message.includes('next-auth/lib/env.js') && {
      hint: 'Deployment still contains next-auth. Ensure Vercel uses pnpm, remove package-lock.json from web/, and redeploy with build cache cleared.'
    }),
    ...(exposeMessage && message.includes('environment') && {
      hint: 'Check Vercel project → Settings → Environment Variables (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_URL or POSTGRES_URL).'
    })
  });
}

// Export Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expressApp = await getApp();

    // Convert Vercel request/response to Express format
    return new Promise<void>((resolve, reject) => {
      try {
        expressApp(req as any, res as any, (err?: any) => {
          if (err) {
            sendError(res, err, 'Express handler error');
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (error) {
        sendError(res, error, 'Handler execution error');
        reject(error);
      }
    });
  } catch (error) {
    sendError(res, error, 'App initialization error');
  }
}
