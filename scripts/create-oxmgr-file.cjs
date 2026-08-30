#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'web');
const outputDir = path.join(root, '.oxmgr');
const outputPath = path.join(outputDir, 'oxfile.generated.toml');
const nodePath = process.execPath;
const nodeDir = path.dirname(nodePath);
const currentPath = process.env.PATH ?? '';

// Local bins must come before the Node installation bin dir: globally installed
// CLIs (e.g. prisma) otherwise shadow the versions pinned in node_modules.
const buildPath = cwd => {
  const seen = new Set();
  const parts = [];

  for (const entry of [path.join(cwd, 'node_modules', '.bin'), nodeDir, ...currentPath.split(path.delimiter)]) {
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      parts.push(entry);
    }
  }

  return parts.join(path.delimiter);
};

const tomlString = value => JSON.stringify(value);

const healthCommand = (portVariable, defaultPort) => {
  const script = `const http=require('http');const port=process.env.${portVariable}||'${defaultPort}';http.get('http://127.0.0.1:'+port+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1));`;
  return `${nodePath} -e ${JSON.stringify(script)}`;
};

const apps = [
  {
    // Discord bot; exposes its health endpoint on HEALTH_PORT (3002).
    name: 'isobel',
    cwd: root,
    command: `${nodePath} --enable-source-maps dist/scripts/migrate-and-start.js`,
    health: healthCommand('HEALTH_PORT', '3002'),
    env: {NODE_ENV: 'production'},
  },
  {
    // Web dashboard: SPA + /api (including Discord auth) on PORT (3001).
    name: 'isobel-web',
    cwd: webRoot,
    command: `${nodePath} --import tsx src/server/serve.ts`,
    health: healthCommand('PORT', '3001'),
    env: {NODE_ENV: 'production', PORT: '3001'},
  },
  {
    // Standalone API without static assets, on API_PORT (3003).
    name: 'isobel-api',
    cwd: webRoot,
    command: `${nodePath} --import tsx src/server/index.ts`,
    health: healthCommand('API_PORT', '3003'),
    env: {NODE_ENV: 'production', API_PORT: '3003'},
  },
];

const renderApp = app => `[[apps]]
name = ${tomlString(app.name)}
namespace = "isobel"
command = ${tomlString(app.command)}
cwd = ${tomlString(app.cwd)}
health_cmd = ${tomlString(app.health)}
health_interval_secs = 30
health_timeout_secs = 10
health_max_failures = 3
max_memory_mb = 1024
unified_logs = true
log_date_format = "%Y-%m-%d %H:%M:%S"

[apps.env]
${Object.entries(app.env).map(([key, value]) => `${key} = ${tomlString(value)}`).join('\n')}
PATH = ${tomlString(buildPath(app.cwd))}
`;

const content = `version = 1

[defaults]
restart_policy = "always"
max_restarts = 50
crash_restart_limit = 10
restart_delay_secs = 5
stop_signal = "SIGTERM"
stop_timeout_secs = 15

${apps.map(app => renderApp(app)).join('\n')}`;

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputPath, content);
console.log(`Wrote ${path.relative(root, outputPath)} with Node ${nodePath}`);
