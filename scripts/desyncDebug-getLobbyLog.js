#!/usr/bin/env node
/**
 * desyncDebug-getLobbyLog: Read lobby_log.jsonl entries within a tick range and/or
 * matching keyword filters.
 *
 * Usage:
 *   npm run desyncDebug-getLobbyLog -- --lobby <CODE> [--from <tick>] [--to <tick>] [--keyword <word>]
 *
 * Options:
 *   --lobby    (required) Lobby code, e.g. 2BE552
 *   --from     (optional) Only show entries at or after this tick
 *   --to       (optional) Only show entries at or before this tick
 *   --keyword  (optional) Only show entries whose raw JSON contains this substring (case-insensitive)
 *              Can be specified multiple times; a line matches if it contains ANY keyword.
 *
 * Examples:
 *   npm run desyncDebug-getLobbyLog -- --lobby 2BE552 --from 630 --to 660
 *   npm run desyncDebug-getLobbyLog -- --lobby 2BE552 --keyword desync --keyword resync
 *   npm run desyncDebug-getLobbyLog -- --lobby 2BE552 --from 630 --to 660 --keyword desync
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
    if (args[i] === flag && i + 1 < args.length) {
      results.push(args[i + 1]);
    }
  }
  return results;
}

const lobbyCode = getArg('--lobby');
const fromTick  = getArg('--from')  != null ? parseInt(getArg('--from'),  10) : null;
const toTick    = getArg('--to')    != null ? parseInt(getArg('--to'),    10) : null;
const keywords  = getAllArgs('--keyword').map(k => k.toLowerCase());

if (!lobbyCode) {
  console.error('Usage: npm run desyncDebug-getLobbyLog -- --lobby <CODE> [--from <N>] [--to <M>] [--keyword <word>]');
  process.exit(1);
}

const filePath = path.join(rootDir, 'storage', 'lobbies', lobbyCode, 'lobby_log.jsonl');
if (!fs.existsSync(filePath)) {
  console.error(`lobby_log.jsonl not found: ${filePath}`);
  process.exit(1);
}

const filterDesc = [
  fromTick != null ? `from=${fromTick}` : null,
  toTick   != null ? `to=${toTick}`     : null,
  keywords.length  ? `keywords=[${keywords.join(',')}]` : null,
].filter(Boolean).join(', ') || '(none)';

console.log(`\nLobby ${lobbyCode} | lobby_log | filters: ${filterDesc}\n`);

let count = 0;
const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let obj;
  try { obj = JSON.parse(trimmed); } catch { return; }

  const tick = obj.tick ?? obj.gameTick ?? null;

  // Tick range filter
  if (fromTick != null && (tick == null || tick < fromTick)) return;
  if (toTick   != null && (tick == null || tick > toTick))   return;

  // Keyword filter
  if (keywords.length > 0) {
    const raw = trimmed.toLowerCase();
    if (!keywords.some(k => raw.includes(k))) return;
  }

  console.log(JSON.stringify(obj));
  count++;
});

rl.on('close', () => {
  if (count === 0) console.log('(no matching entries)');
});
