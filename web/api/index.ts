// File: web/api/index.ts
// Vercel Serverless Function - handles all /api/* routes

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/server/app';

// Create Express app instance (singleton for warm starts)
let app: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!app) {
    app = createApp();
  }
  return app;
}

// Export Vercel serverless function handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  const expressApp = getApp();

  // Convert Vercel request/response to Express format
  return new Promise<void>((resolve, reject) => {
    try {
      expressApp(req as any, res as any, (err?: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
