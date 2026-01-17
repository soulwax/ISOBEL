// File: api/index.ts
// Vercel serverless function - main API handler

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/server/app.js';

// Create Express app (reuse server setup)
const app = createApp();

// Export Vercel serverless function handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Convert Vercel request/response to Express format
  return new Promise<void>((resolve) => {
    app(req as any, res as any, () => {
      resolve();
    });
  });
}
