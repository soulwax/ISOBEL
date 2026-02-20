import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, parse } from 'dotenv';

const VERCEL_MARKERS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'NOW_REGION'] as const;

let hasLoadedEnv = false;

export function isVercelRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return VERCEL_MARKERS.some((marker) => Boolean(env[marker]?.trim()));
}

function findConflictingKeys(envPath: string, env: NodeJS.ProcessEnv = process.env): string[] {
  if (!existsSync(envPath)) {
    return [];
  }

  const parsedEnv = parse(readFileSync(envPath));
  return Object.keys(parsedEnv).filter((key) => {
    const runtimeValue = env[key];
    return runtimeValue !== undefined && runtimeValue !== parsedEnv[key];
  });
}

export function loadEnvWithSafeguard(envPath = resolve(process.cwd(), '.env')): void {
  if (hasLoadedEnv) {
    return;
  }

  const onVercel = isVercelRuntime();
  const conflictingKeys = findConflictingKeys(envPath);

  if (onVercel && conflictingKeys.length > 0) {
    console.warn(
      `[env] Vercel runtime detected. Keeping platform env values over ${envPath} for keys: ${conflictingKeys.join(', ')}`
    );
  }

  config({
    path: envPath,
    override: !onVercel,
  });

  hasLoadedEnv = true;
}
