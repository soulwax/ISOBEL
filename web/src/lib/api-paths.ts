// File: web/src/lib/api-paths.ts

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeApiBase(rawValue: string | undefined): string | null {
  if (!rawValue) {
    return null;
  }

  const normalized = trimTrailingSlash(rawValue.trim());
  if (!normalized) {
    return null;
  }

  if (normalized.endsWith('/api/auth')) {
    return normalized.slice(0, -'/auth'.length);
  }

  if (normalized.endsWith('/api')) {
    return normalized;
  }

  return `${normalized}/api`;
}

const configuredApiBase = normalizeApiBase(import.meta.env.VITE_AUTH_API_URL);

export const API_BASE_URL = import.meta.env.PROD
  ? (configuredApiBase ?? '/api')
  : '/api';

export const AUTH_BASE_URL = `${API_BASE_URL}/auth`;
