#!/usr/bin/env node
/**
 * desyncDebug-getOrders: Read order entries from applied_orders.jsonl, pending_orders.jsonl,
 * or lobby_log.jsonl within a given tick range, with optional keyword filtering.
 *
 * Usage:
 *   npm run desyncDebug-getOrders -- --lobby <CODE> --from <tick> --to <tick> [--file <applied|pending|log>] [--keyword <word>]
 *
 * Options:
 *   --lobby    (required) Lobby code, e.g. 2BE552
 *   --from     (required) Start tick (inclusive) — matched against tick, atTick, or gameTick fields
 *   --to       (required) End tick (inclusive)
 *   --file     (optional) Which file: "applied" (default), "pending", or "log" (lobby_log.jsonl)
 *   --keyword  (optional) Only show entries whose raw JSON contains this substring (case-insensitive).
 *              Can be specified multiple times; a line matches if it contains ANY keyword.
 *
 * Examples:
 *   npm run desyncDebug-getOrders -- --lobby 2BE552 --from 960 --to 975
 *   npm run desyncDebug-getOrders -- --lobby 2BE552 --from 960 --to 975 --file pending
 *   npm run desyncDebug-getOrders -- --lobby 2BE552 --from 476 --to 480 --file log --keyword replayOrdersSince
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

function getAllArgs(flag) {
  const results = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) results.push(args[i + 1]);
  }
  return results;
}

const lobbyCode = getArg('--lobby');
const fromTick  = parseInt(getArg('--from') ?? '', 10);
const toTick    = parseInt(getArg('--to')   ?? '', 10);
const fileType  = getArg('--file') ?? 'applied';
const keywords  = getAllArgs('--keyword').map(k => k.toLowerCase());

if (!lobbyCode || isNaN(fromTick) || isNaN(toTick)) {
  console.error('Usage: npm run desyncDebug-getOrders -- --lobby <CODE> --from <N> --to <M> [--file applied|pending|log] [--keyword <word>]');
  process.exit(1);
}

let fileName;
if (fileType === 'pending') fileName = 'pending_orders.jsonl';
else if (fileType === 'log') fileName = 'lobby_log.jsonl';
else fileName = 'applied_orders.jsonl';
const filePath = path.join(rootDir, 'storage', 'lobbies', lobbyCode, fileName);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const filterDesc = keywords.length ? ` | keywords=[${keywords.join(',')}]` : '';
console.log(`\nLobby ${lobbyCode} | ${fileName} | ticks ${fromTick}–${toTick}${filterDesc}\n`);

let count = 0;
const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let obj;
  try { obj = JSON.parse(trimmed); } catch { return; }
  const tick = obj.tick ?? obj.atTick ?? obj.gameTick ?? -1;
  if (tick < fromTick || tick > toTick) return;
  if (keywords.length > 0 && !keywords.some(k => trimmed.toLowerCase().includes(k))) return;
  console.log(JSON.stringify(obj));
  count++;
});
rl.on('close', () => {
  if (count === 0) console.log('(no entries in range)');
});
