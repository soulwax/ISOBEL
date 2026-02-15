import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, parse } from 'dotenv';

const VERCEL_MARKERS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'NOW_REGION'];

let hasLoadedEnv = false;

function isVercelRuntime(env = process.env) {
  return VERCEL_MARKERS.some((marker) => Boolean(env[marker]?.trim()));
}

function findConflictingKeys(envPath, env = process.env) {
  if (!existsSync(envPath)) {
    return [];
  }

  const parsedEnv = parse(readFileSync(envPath));
  return Object.keys(parsedEnv).filter((key) => {
    const runtimeValue = env[key];
    return runtimeValue !== undefined && runtimeValue !== parsedEnv[key];
  });
}

export function loadEnvWithSafeguard(envPath = resolve(process.cwd(), '.env')) {
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
