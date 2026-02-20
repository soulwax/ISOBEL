// File: web/env.d.ts

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOT_HEALTH_URL?: string;
  readonly VITE_AUTH_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
