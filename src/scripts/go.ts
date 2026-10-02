// File: src/scripts/go.ts

/**
 * ISOBEL — Full Update, Build & Deploy Script
 *
 * Usage: pnpm go [--skip-pull] [--skip-env] [--skip-health] [--pm2]
 *
 * Steps:
 *   1. git pull (unless --skip-pull)
 *   2. Verify environment (unless --skip-env)
 *   3. pnpm install -r (all workspaces)
 *   4. Prisma generate (bot)
 *   5. Prisma migrate deploy (bot DB)
 *   6. Drizzle migrate (web DB)
 *   7. Build all (tsc + vite)
 *   8. Restart all services (oxmgr or pm2)
 *   9. Health checks (unless --skip-health)
 */

import { execa, type ExecaError, type Result } from 'execa';
import { setTimeout as sleep } from 'node:timers/promises';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const ARGS = new Set(process.argv.slice(2));

const skipPull = ARGS.has('--skip-pull');
const skipEnv = ARGS.has('--skip-env');
const skipHealth = ARGS.has('--skip-health');
const usePm2 = ARGS.has('--pm2');

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let stepNum = 0;

function header(msg: string): void {
  stepNum++;
  console.log(`\n${BOLD}${CYAN}[${stepNum}]${RESET} ${BOLD}${msg}${RESET}`);
}

function success(msg: string): void {
  console.log(`  ${GREEN}✔${RESET} ${msg}`);
}

function warn(msg: string): void {
  console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

function fail(msg: string): void {
  console.error(`  ${RED}✖${RESET} ${msg}`);
}

function dim(msg: string): void {
  console.log(`  ${DIM}${msg}${RESET}`);
}

async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; silent?: boolean } = {},
): Promise<Result> {
  const { cwd = ROOT, env, silent = false } = opts;
  dim(`$ ${cmd} ${args.join(' ')}`);
  try {
    const result = await execa(cmd, args, {
      cwd,
      preferLocal: true,
      env,
      stdout: silent ? 'pipe' : 'inherit',
      stderr: silent ? 'pipe' : 'inherit',
    });
    return result;
  } catch (error) {
    const execaErr = error as ExecaError;
    if (execaErr.stderr && typeof execaErr.stderr === 'string') {
      fail(execaErr.stderr.split('\n')[0]);
    }
    throw error;
  }
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function gitPull(): Promise<void> {
  header('Pulling latest changes');
  if (skipPull) {
    warn('Skipped (--skip-pull)');
    return;
  }
  try {
    const result = await run('git', ['pull', '--rebase', '--autostash'], { silent: true });
    const stdout = (result.stdout ?? '').toString().trim();
    if (stdout.includes('Already up to date')) {
      success('Already up to date');
    } else {
      success(`Pulled: ${stdout.split('\n')[0]}`);
    }
  } catch {
    warn('git pull failed — continuing anyway (you may be on a detached HEAD or have conflicts)');
  }
}

async function verifyEnv(): Promise<void> {
  header('Verifying environment');
  if (skipEnv) {
    warn('Skipped (--skip-env)');
    return;
  }
  try {
    await run('tsx', ['src/scripts/verify-environment.ts'], { silent: true });
    success('Environment OK');
  } catch {
    warn('Environment verification reported issues — continuing (check output above)');
  }
}

async function installDeps(): Promise<void> {
  header('Installing dependencies');
  await run('pnpm', ['install', '-r']);
  success('All workspace dependencies installed');
}

async function prismaGenerate(): Promise<void> {
  header('Generating Prisma client');
  await run('pnpm', ['run', 'prisma:generate']);
  success('Prisma client generated');
}

async function prismaMigrate(): Promise<void> {
  header('Applying bot DB migrations (Prisma)');
  try {
    await run('pnpm', ['run', 'prisma:migrate:deploy']);
    success('Bot DB migrations applied');
  } catch {
    warn('Prisma migrate deploy failed — the bot startup (migrate-and-start) will retry');
  }
}

async function checkPrismaMigrationStatus(): Promise<void> {
  header('Checking bot DB migration status');
  try {
    const result = await run('pnpm', ['run', 'prisma:migrate:status'], { silent: true });
    const stdout = (result.stdout ?? '').toString();
    if (stdout.includes('Database schema is up to date')) {
      success('Bot DB schema is up to date');
    } else if (stdout.includes('have not yet been applied')) {
      warn('Pending bot migrations detected — they will be applied in the next step');
    } else {
      success('Bot DB migration status checked');
    }
  } catch {
    warn('Could not check Prisma migration status — continuing');
  }
}

async function drizzleMigrate(): Promise<void> {
  header('Applying web DB migrations (Drizzle)');
  try {
    await run('pnpm', ['--filter', 'isobel-web', 'run', 'db:push']);
    success('Web DB schema pushed');
  } catch {
    warn('Drizzle push failed — the web app may still work if the schema is already current');
  }
}

async function buildAll(): Promise<void> {
  header('Building all packages');
  await run('pnpm', ['run', 'build:all']);
  success('Bot + Web built successfully');
}

async function restartOxmgr(): Promise<void> {
  header('Restarting services (oxmgr)');
  try {
    await run('pnpm', ['run', 'oxmgr:restart:all']);
    success('All oxmgr services restarted');
  } catch {
    warn('oxmgr restart failed — trying oxmgr:apply (first start)');
    try {
      await run('pnpm', ['run', 'oxmgr:apply']);
      success('oxmgr services started via apply');
    } catch {
      fail('oxmgr apply also failed — check oxmgr configuration');
      throw new Error('Failed to start services');
    }
  }
}

async function restartPm2(): Promise<void> {
  header('Restarting services (PM2)');
  try {
    await run('pnpm', ['run', 'restart:all']);
    success('All PM2 services restarted');
  } catch {
    warn('PM2 restart failed — trying fresh start');
    try {
      await run('pnpm', ['run', 'start:all:prod']);
      success('PM2 services started');
    } catch {
      fail('PM2 start also failed — check PM2 configuration');
      throw new Error('Failed to start services');
    }
  }
}

async function healthChecks(): Promise<void> {
  header('Running health checks');
  if (skipHealth) {
    warn('Skipped (--skip-health)');
    return;
  }

  // Give services a moment to start up
  dim('Waiting 5s for services to start…');
  await sleep(5000);

  const checks = [
    { name: 'Bot', port: 3002 },
    { name: 'Web', port: 3001 },
    { name: 'API', port: 3003 },
  ];

  for (const check of checks) {
    try {
      const result = await run('curl', ['-sf', `http://127.0.0.1:${check.port}/health`], { silent: true });
      const body = (result.stdout ?? '').toString().trim();
      success(`${check.name} (port ${check.port}): ${body.slice(0, 80) || 'OK'}`);
    } catch {
      warn(`${check.name} (port ${check.port}): not responding yet — it may still be starting`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}━━━ ISOBEL — Full Update, Build & Deploy ━━━${RESET}`);
  console.log(`${DIM}Flags: ${[
    skipPull ? '--skip-pull' : '',
    skipEnv ? '--skip-env' : '',
    skipHealth ? '--skip-health' : '',
    usePm2 ? '--pm2' : 'oxmgr',
  ].filter(Boolean).join(' ')}${RESET}`);

  const startTime = Date.now();

  await gitPull();
  await verifyEnv();
  await installDeps();
  await prismaGenerate();
  await checkPrismaMigrationStatus();
  await prismaMigrate();
  await drizzleMigrate();
  await buildAll();

  if (usePm2) {
    await restartPm2();
  } else {
    await restartOxmgr();
  }

  await healthChecks();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${BOLD}${GREEN}━━━ Done in ${elapsed}s ━━━${RESET}\n`);
}

main().catch((error: Error) => {
  console.error(`\n${RED}${BOLD}━━━ FAILED ━━━${RESET}`);
  console.error(error.message ?? error);
  process.exit(1);
});
