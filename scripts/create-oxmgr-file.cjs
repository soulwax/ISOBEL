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
const buildPath = binDir => {
  const seen = new Set();
  const parts = [];

  for (const entry of [binDir, nodeDir, ...currentPath.split(path.delimiter)]) {
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

const botCommand = `${nodePath} --enable-source-maps dist/scripts/migrate-and-start.js`;
const webCommand = `${nodePath} --import tsx src/server/serve.ts`;

const content = `version = 1

[defaults]
restart_policy = "on_failure"
max_restarts = 10
crash_restart_limit = 3
restart_delay_secs = 4
stop_signal = "SIGTERM"
stop_timeout_secs = 5

[[apps]]
name = "isobel"
namespace = "isobel"
command = ${tomlString(botCommand)}
cwd = ${tomlString(root)}
health_cmd = ${tomlString(healthCommand('HEALTH_PORT', '3002'))}
health_interval_secs = 30
health_timeout_secs = 10
health_max_failures = 3
max_memory_mb = 1024
unified_logs = true
log_date_format = "%Y-%m-%d %H:%M:%S"

[apps.env]
NODE_ENV = "production"
PATH = ${tomlString(buildPath(path.join(root, 'node_modules', '.bin')))}

[[apps]]
name = "isobel-web"
namespace = "isobel"
command = ${tomlString(webCommand)}
cwd = ${tomlString(webRoot)}
health_cmd = ${tomlString(healthCommand('PORT', '3001'))}
health_interval_secs = 30
health_timeout_secs = 10
health_max_failures = 3
max_memory_mb = 1024
unified_logs = true
log_date_format = "%Y-%m-%d %H:%M:%S"

[apps.env]
NODE_ENV = "production"
PORT = "3001"
PATH = ${tomlString(buildPath(path.join(webRoot, 'node_modules', '.bin')))}
`;

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputPath, content);
console.log(`Wrote ${path.relative(root, outputPath)} with Node ${nodePath}`);
