import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parse } from 'dotenv';

let hasLoadedEnv = false;

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

export function loadEnvFiles(): void {
  if (hasLoadedEnv) {
    return;
  }

  const shouldOverrideExisting = Boolean(process.env.ENV_FILE);
  const keysLoadedFromEnvFiles = new Set<string>();

  for (const envPath of getEnvPaths()) {
    if (!existsSync(envPath)) {
      continue;
    }

    const parsedEnv = parse(readFileSync(envPath));

    for (const [key, value] of Object.entries(parsedEnv)) {
      const hasRuntimeValue = process.env[key] !== undefined;
      const shouldApplyValue = !hasRuntimeValue || shouldOverrideExisting || keysLoadedFromEnvFiles.has(key);

      if (!shouldApplyValue) {
        continue;
      }

      process.env[key] = value;
      keysLoadedFromEnvFiles.add(key);
    }
  }

  hasLoadedEnv = true;
}
