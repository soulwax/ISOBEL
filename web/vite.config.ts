// File: web/vite.config.ts

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: './build',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces
    port: parseInt(process.env.PORT || '3001', 10),
    allowedHosts: true, // Allow all hosts
    proxy: {
      '/api': {
        target: process.env.VITE_AUTH_API_URL || 'http://localhost:3003',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('Proxying:', req.method, req.url, '-> target:', process.env.VITE_AUTH_API_URL || 'http://localhost:3003');
          });
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0', // Listen on all interfaces for production
    port: parseInt(process.env.PORT || '3001', 10),
    proxy: {
      '/api': {
        target: process.env.VITE_AUTH_API_URL || 'http://localhost:3003',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
