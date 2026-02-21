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
      const { createApp } = await import('../src/server/app');
      app = createApp();
    } catch (error) {
      appError = error instanceof Error ? error : new Error(String(error));
      throw appError;
    }
  }
  return app;
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
            console.error('Express handler error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.error('Handler execution error:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('App initialization error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? errorMessage : 'Service unavailable'
    });
  }
}
