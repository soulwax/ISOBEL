// File: web/ecosystem.config.cjs
// Single web app: API (including Discord auth) + static frontend on PORT.

const path = require('path');
const { loadEnvWithSafeguard } = require('./scripts/load-env.cjs');

loadEnvWithSafeguard(path.resolve(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'isobel-web',
      script: 'pnpm',
      args: ['exec', 'tsx', 'src/server/serve.ts'],
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
      // Run 'pnpm build' before starting in production (serves from ./build)
      error_file: path.join(__dirname, 'logs', 'web-error.log'),
      out_file: path.join(__dirname, 'logs', 'web-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
