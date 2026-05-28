// File: web/scripts/load-env.cjs

const { existsSync, readFileSync } = require('node:fs');
const { basename, dirname, resolve } = require('node:path');
const { parse } = require('dotenv');

const VERCEL_MARKERS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'NOW_REGION'];

let hasLoadedEnv = false;

function isVercelRuntime(env = process.env) {
  return VERCEL_MARKERS.some((marker) => Boolean(env[marker] && env[marker].trim()));
}

function getEnvPaths(explicitPath = process.env.ENV_FILE) {
  const primaryPath = explicitPath
    ? resolve(explicitPath)
    : resolve(process.cwd(), '.env');

  const envPaths = [primaryPath];

  if (basename(primaryPath) === '.env') {
    envPaths.push(resolve(dirname(primaryPath), '.env.local'));
  }

  return envPaths;
}

function findConflictingKeys(envPaths, env = process.env) {
  const conflictingKeys = new Set();

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

function loadEnvWithSafeguard(envPath = process.env.ENV_FILE ?? resolve(process.cwd(), '.env')) {
  if (hasLoadedEnv) {
    return;
  }

  const envPaths = getEnvPaths(envPath);
  const onVercel = isVercelRuntime();
  const conflictingKeys = findConflictingKeys(envPaths);
  const keysLoadedFromEnvFiles = new Set();

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

module.exports = {
  loadEnvWithSafeguard,
  isVercelRuntime,
};
