#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.oxmgr');
const outputPath = path.join(outputDir, 'oxfile.generated.toml');
const nodePath = process.execPath;
const nodeDir = path.dirname(nodePath);
const currentPath = process.env.PATH ?? '';
const pathValue = currentPath.split(path.delimiter).includes(nodeDir)
  ? currentPath
  : `${nodeDir}${path.delimiter}${currentPath}`;

const tomlString = value => JSON.stringify(value);
const command = `${nodePath} --enable-source-maps dist/scripts/migrate-and-start.js`;
const healthScript = "const http=require('http');const port=process.env.HEALTH_PORT||'3002';http.get('http://127.0.0.1:'+port+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1));";
const healthCommand = `${nodePath} -e ${JSON.stringify(healthScript)}`;

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
command = ${tomlString(command)}
cwd = ${tomlString(root)}
health_cmd = ${tomlString(healthCommand)}
health_interval_secs = 30
health_timeout_secs = 10
health_max_failures = 3
max_memory_mb = 1024
unified_logs = true
log_date_format = "%Y-%m-%d %H:%M:%S"

[apps.env]
NODE_ENV = "production"
PATH = ${tomlString(pathValue)}
`;

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputPath, content);
console.log(`Wrote ${path.relative(root, outputPath)} with Node ${nodePath}`);
