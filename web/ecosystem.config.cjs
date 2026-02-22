// File: web/ecosystem.config.cjs

const path = require('path');
const { loadEnvWithSafeguard } = require('./scripts/load-env.cjs');

loadEnvWithSafeguard(path.resolve(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'isobel-web',
      script: path.join(__dirname, 'scripts', 'start-web.js'),
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || '3001',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3001',
      },
      // In production, serves optimized build from ./build directory
      // Make sure to run 'npm run build' before starting in production
      error_file: path.join(__dirname, 'logs', 'web-error.log'),
      out_file: path.join(__dirname, 'logs', 'web-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'isobel-auth',
      script: 'npm',
      args: 'run dev:auth',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: '3003', // Auth server always uses port 3003
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3001',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: '3003', // Auth server always uses port 3003
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'https://isobelnet.de',
      },
      error_file: path.join(__dirname, 'logs', 'auth-error.log'),
      out_file: path.join(__dirname, 'logs', 'auth-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
