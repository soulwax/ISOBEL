// File: web/src/server/index.ts

import { loadEnvWithSafeguard } from "../lib/load-env";
loadEnvWithSafeguard();

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

// API server port for dev (Vite proxies /api here; default 3003)
const PORT = getEnv("PORT", getEnv("API_PORT", "3003"));

// Start server
app.listen(PORT, () => {
  logger.info(`API server running on http://localhost:${PORT}`);
});
