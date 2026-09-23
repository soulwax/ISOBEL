#!/usr/bin/env node

// The oxmgr equivalent of `pm2 save`.
//
// oxmgr already persists every managed process to its own state file as it goes,
// and the systemd user service restores them on boot — so unlike pm2 there is no
// save step that the daemon depends on. This snapshots that state into .oxmgr/
// anyway, so a corrupted or wiped daemon state can be inspected and rebuilt.
// Restore with `pnpm run oxmgr:resurrect`, which re-applies oxfile.toml.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const statePath = path.join(dataHome, 'oxmgr', 'state.json');
const snapshotPath = path.join(root, '.oxmgr', 'state.snapshot.json');

if (!fs.existsSync(statePath)) {
  console.error(`No oxmgr state found at ${statePath}`);
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const processes = state.processes ?? [];

fs.mkdirSync(path.dirname(snapshotPath), {recursive: true});
fs.writeFileSync(snapshotPath, JSON.stringify(state, null, 2));

console.log(`Saved ${processes.length} process definition(s) to ${path.relative(root, snapshotPath)}`);
for (const item of processes) {
  console.log(`  ${String(item.id).padStart(3)}  ${item.name}`);
}
