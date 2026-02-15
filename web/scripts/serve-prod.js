// File: web/scripts/serve-prod.js
// Simple production server for serving static build files

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadEnvWithSafeguard } from './load-env.js';

loadEnvWithSafeguard();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const buildDir = join(__dirname, '..', 'build');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from build directory
app.use(express.static(buildDir));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for all other routes
app.use((req, res) => {
  res.sendFile(join(buildDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Production server running on http://0.0.0.0:${PORT}`);
  console.log(`📂 Serving static files from: ${buildDir}`);
});
