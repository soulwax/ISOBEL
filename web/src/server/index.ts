// File: web/src/server/index.ts

import { config } from 'dotenv';
config();

import { logger } from "../lib/logger";
import { validateEnv, getEnv } from "../lib/env";
import { createApp } from "./app";

// Validate environment variables at startup
try {
  validateEnv();
} catch (error) {
  logger.error("Environment validation failed", { error });
  process.exit(1);
}

// Create Express app
const app = createApp();

// Auth server port (defaults to 3003, separate from Vite port 3001)
const PORT = getEnv("AUTH_PORT", "3003");

// Start server
app.listen(PORT, () => {
  logger.info(`Auth server running on http://localhost:${PORT}`);
});
