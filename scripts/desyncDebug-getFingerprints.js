#!/usr/bin/env node
/**
 * desyncDebug-getFingerprints: Read fingerprint entries from a lobby's fingerprints.jsonl
 * within a given tick range.
 *
 * Usage:
 *   npm run desyncDebug-getFingerprints -- --lobby <LOBBY_CODE> --from <tick> --to <tick>
 *
 * Examples:
 *   npm run desyncDebug-getFingerprints -- --lobby 2BE552 --from 638 --to 650
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const lobbyCode = getArg('--lobby');
const fromTick  = parseInt(getArg('--from') ?? '', 10);
const toTick    = parseInt(getArg('--to')   ?? '', 10);

if (!lobbyCode || isNaN(fromTick) || isNaN(toTick)) {
  console.error('Usage: npm run desyncDebug-getFingerprints -- --lobby <CODE> --from <N> --to <M>');
  process.exit(1);
}

const filePath = path.join(rootDir, 'storage', 'lobbies', lobbyCode, 'fingerprints.jsonl');
if (!fs.existsSync(filePath)) {
  console.error(`fingerprints.jsonl not found: ${filePath}`);
  process.exit(1);
}

console.log(`\nLobby ${lobbyCode} | fingerprints for ticks ${fromTick}–${toTick}\n`);

const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let obj;
  try { obj = JSON.parse(trimmed); } catch { return; }
  const tick = obj.tick ?? obj.gameTick ?? -1;
  if (tick >= fromTick && tick <= toTick) {
    console.log(JSON.stringify(obj));
  }
});
