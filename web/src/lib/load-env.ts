// File: web/src/lib/load-env.ts

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parse } from 'dotenv';

const VERCEL_MARKERS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'NOW_REGION'] as const;

let hasLoadedEnv = false;

export function isVercelRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return VERCEL_MARKERS.some((marker) => Boolean(env[marker]?.trim()));
}

function getEnvPaths(explicitPath = process.env.ENV_FILE): string[] {
  const primaryPath = explicitPath
    ? resolve(explicitPath)
    : resolve(process.cwd(), '.env');

  const envPaths = [primaryPath];

  if (basename(primaryPath) === '.env') {
    envPaths.push(resolve(dirname(primaryPath), '.env.local'));
  }

  return envPaths;
}

function findConflictingKeys(envPaths: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  const conflictingKeys = new Set<string>();

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    const parsedEnv = parse(readFileSync(envPath));

    for (const [key, value] of Object.entries(parsedEnv)) {
      const runtimeValue = env[key];

      if (runtimeValue !== undefined && runtimeValue !== value) {
        conflictingKeys.add(key);
      }
    }
  }

  return [...conflictingKeys];
}

export function loadEnvWithSafeguard(envPath = process.env.ENV_FILE ?? resolve(process.cwd(), '.env')): void {
  if (hasLoadedEnv) {
    return;
  }

  const envPaths = getEnvPaths(envPath);
  const onVercel = isVercelRuntime();
  const conflictingKeys = findConflictingKeys(envPaths);
  const keysLoadedFromEnvFiles = new Set<string>();

  if (onVercel && conflictingKeys.length > 0) {
    console.warn(
      `[env] Vercel runtime detected. Keeping platform env values over ${envPath} for keys: ${conflictingKeys.join(', ')}`
    );
  }

  for (const currentEnvPath of envPaths) {
    if (!existsSync(currentEnvPath)) {
      continue;
    }

    const parsedEnv = parse(readFileSync(currentEnvPath));

    for (const [key, value] of Object.entries(parsedEnv)) {
      const hasRuntimeValue = process.env[key] !== undefined;
      const shouldApplyValue = !hasRuntimeValue || !onVercel || keysLoadedFromEnvFiles.has(key);

      if (!shouldApplyValue) {
        continue;
      }

      process.env[key] = value;
      keysLoadedFromEnvFiles.add(key);
    }
  }

  hasLoadedEnv = true;
}
