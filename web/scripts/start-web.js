// File: web/scripts/start-web.js
// Wrapper script to start web server in dev or production mode

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
config();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // In production, serve the optimized build from ./build
  console.log('Starting production server (serving from ./build)...');
  console.log(`PORT from environment: ${process.env.PORT || 'not set'}`);
  // Use execFile to avoid shell injection and deprecation warning
  const vitePreview = spawn('npm', ['run', 'preview'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    env: {
      ...process.env, // Pass through all environment variables including PORT
    },
  });

  vitePreview.on('error', (error) => {
    console.error('Failed to start production server:', error);
    process.exit(1);
  });

  vitePreview.on('exit', (code) => {
    process.exit(code || 0);
  });
} else {
  // In development, use vite dev server
  console.log('Starting development server...');
  console.log(`PORT from environment: ${process.env.PORT || 'not set'}`);
  const viteDev = spawn('npm', ['run', 'dev'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env, // Pass through all environment variables including PORT
    },
  });

  viteDev.on('error', (error) => {
    console.error('Failed to start development server:', error);
    process.exit(1);
  });

  viteDev.on('exit', (code) => {
    process.exit(code || 0);
  });
}
