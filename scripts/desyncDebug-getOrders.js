#!/usr/bin/env node
/**
 * desyncDebug-getOrders: Read order entries from applied_orders.jsonl or pending_orders.jsonl
 * within a given tick range.
 *
 * Usage:
 *   npm run desyncDebug-getOrders -- --lobby <CODE> --from <tick> --to <tick> [--file <applied|pending>]
 *
 * Options:
 *   --lobby   (required) Lobby code, e.g. 2BE552
 *   --from    (required) Start tick (inclusive) — matched against tick, atTick, or gameTick fields
 *   --to      (required) End tick (inclusive)
 *   --file    (optional) Which file to read: "applied" (default) or "pending"
 *
 * Examples:
 *   npm run desyncDebug-getOrders -- --lobby 2BE552 --from 960 --to 975
 *   npm run desyncDebug-getOrders -- --lobby 2BE552 --from 960 --to 975 --file pending
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
const fileType  = getArg('--file') ?? 'applied';

if (!lobbyCode || isNaN(fromTick) || isNaN(toTick)) {
  console.error('Usage: npm run desyncDebug-getOrders -- --lobby <CODE> --from <N> --to <M> [--file applied|pending]');
  process.exit(1);
}

const fileName = fileType === 'pending' ? 'pending_orders.jsonl' : 'applied_orders.jsonl';
const filePath = path.join(rootDir, 'storage', 'lobbies', lobbyCode, fileName);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

console.log(`\nLobby ${lobbyCode} | ${fileName} | ticks ${fromTick}–${toTick}\n`);

let count = 0;
const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let obj;
  try { obj = JSON.parse(trimmed); } catch { return; }
  const tick = obj.tick ?? obj.atTick ?? obj.gameTick ?? -1;
  if (tick >= fromTick && tick <= toTick) {
    console.log(JSON.stringify(obj));
    count++;
  }
});
rl.on('close', () => {
  if (count === 0) console.log('(no entries in range)');
});
