#!/usr/bin/env node
/**
 * desyncDebug-diffSnapshot: Diff a host snapshot against a client state to confirm whether
 * serialized game states agree even when runtime fingerprints diverge.
 *
 * Usage:
 *   npm run desyncDebug-diffSnapshot -- --lobby <CODE> --tick <N> --vs <file>
 *   npm run desyncDebug-diffSnapshot -- --lobby <CODE> --tick <N> --vs-log <tick>
 *
 * Options:
 *   --lobby      (required) Lobby code, e.g. A381D4
 *   --tick       (required) Snapshot tick to load as the "host" reference
 *   --vs         Load client state from a JSON file path
 *   --vs-log     Search lobby_log.jsonl for a state dump at the given tick
 *                (looks for entries with context.state, context.game_state, or context.gameState)
 *   --field      Dot-path to zoom in on (e.g. --field units[0].x). Can be repeated.
 *                Without --field, shows randomSeed, gameTick, gameTime, and all diverging top-level fields.
 *
 * Examples:
 *   npm run desyncDebug-diffSnapshot -- --lobby A381D4 --tick 372 --vs-log 372
 *   npm run desyncDebug-diffSnapshot -- --lobby A381D4 --tick 185 --vs client_state.json
 *   npm run desyncDebug-diffSnapshot -- --lobby A381D4 --tick 372 --vs-log 372 --field randomSeed --field units
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
function getAllArgs(flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) out.push(args[i + 1]);
  }
  return out;
}

const lobbyCode  = getArg('--lobby');
const tick       = parseInt(getArg('--tick') ?? '', 10);
const vsFile     = getArg('--vs');
const vsLogTick  = getArg('--vs-log') != null ? parseInt(getArg('--vs-log'), 10) : null;
const fieldPaths = getAllArgs('--field');

if (!lobbyCode || isNaN(tick) || (!vsFile && vsLogTick == null)) {
  console.error('Usage: npm run desyncDebug-diffSnapshot -- --lobby <CODE> --tick <N> (--vs <file> | --vs-log <tick>)');
  process.exit(1);
}

const lobbyDir = path.join(rootDir, 'storage', 'lobbies', lobbyCode);

// ---------------------------------------------------------------------------
// State loading
// ---------------------------------------------------------------------------

function normalizeGameState(raw) {
  if (!raw) return null;
  // Snapshot envelope: { state: {...}, synchash: "...", tick: N }
  // Or the raw serialized state directly
  return raw.state ?? raw.game_state ?? raw.gameState ?? raw;
}

function loadSnapshot(snapshotTick) {
  const p = path.join(lobbyDir, 'snapshots', `${snapshotTick}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return normalizeGameState(JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch (e) {
    console.error(`Failed to parse snapshot ${snapshotTick}: ${e.message}`);
    return null;
  }
}

function findStateDumpInLog(searchTick) {
  const logPath = path.join(lobbyDir, 'lobby_log.jsonl');
  if (!fs.existsSync(logPath)) return null;

  const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let obj;
    try { obj = JSON.parse(t); } catch { continue; }

    // Try to find a state embedded in the context
    const ctx = obj.context;
    if (!ctx || typeof ctx !== 'object') continue;

    // Candidate locations for the serialized game state
    const candidates = [
      ctx.serializedGameState,   // "debug: local serialized game state" log entries
      ctx.state,
      ctx.game_state,
      ctx.gameState,
      ctx.serializedState,
      // Some log entries write context fields directly as the game state
      (typeof ctx.gameTick === 'number' && typeof ctx.randomSeed === 'number') ? ctx : null,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const gs = normalizeGameState(candidate);
      if (!gs) continue;
      const gsTick = gs.gameTick ?? gs.tick;
      if (gsTick === searchTick) {
        return gs;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deep diff
// ---------------------------------------------------------------------------

function getNestedValue(obj, dotPath) {
  // Supports dot notation and array indices: "units[0].hp"
  const parts = dotPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function summarizeValue(v, maxLen = 120) {
  const s = JSON.stringify(v);
  if (s == null) return String(v);
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

// Returns list of {path, a, b} for all diverging leaf values
function deepDiff(a, b, basePath = '', depth = 0) {
  const diffs = [];

  if (a === b) return diffs;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);

  // Type mismatch (one is array, other is not; or different primitives)
  if (aIsArr !== bIsArr) {
    diffs.push({ path: basePath || '(root)', a, b });
    return diffs;
  }

  if (aIsArr) {
    if (a.length !== b.length) {
      diffs.push({ path: `${basePath}.length`, a: a.length, b: b.length });
    }
    // Diff element-by-element; cap recursion at 200 shallow / 50 deep to avoid huge output
    const len = Math.min(Math.max(a.length, b.length), depth < 2 ? 200 : 50);
    for (let i = 0; i < len; i++) {
      diffs.push(...deepDiff(a[i], b[i], `${basePath}[${i}]`, depth + 1));
    }
    return diffs;
  }

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    diffs.push({ path: basePath || '(root)', a, b });
    return diffs;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    diffs.push(...deepDiff(a[key], b[key], basePath ? `${basePath}.${key}` : key, depth + 1));
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const hostState = loadSnapshot(tick);
if (!hostState) {
  console.error(`Host snapshot not found: storage/lobbies/${lobbyCode}/snapshots/${tick}.json`);
  process.exit(1);
}

let clientState = null;
let clientSource = '';

if (vsFile) {
  if (!fs.existsSync(vsFile)) {
    console.error(`Client state file not found: ${vsFile}`);
    process.exit(1);
  }
  try {
    clientState = normalizeGameState(JSON.parse(fs.readFileSync(vsFile, 'utf-8')));
    clientSource = vsFile;
  } catch (e) {
    console.error(`Failed to parse client state file: ${e.message}`);
    process.exit(1);
  }
} else {
  clientState = findStateDumpInLog(vsLogTick);
  clientSource = `lobby_log.jsonl @ tick ${vsLogTick}`;
  if (!clientState) {
    console.error(`No state dump found for tick ${vsLogTick} in lobby_log.jsonl.`);
    console.error('State dumps are written when a client serializes its state during a critical log event.');
    console.error('Try --vs-log with a different tick, or extract the state manually and use --vs <file>.');
    process.exit(1);
  }
}

console.log(`\nLobby ${lobbyCode} | host: snapshots/${tick}.json | client: ${clientSource}\n`);

// Always show these key sync fields
const syncFields = ['gameTick', 'gameTime', 'randomSeed', 'roundNumber'];
console.log('[Key sync fields]');
for (const f of syncFields) {
  const aVal = hostState[f];
  const bVal = clientState[f];
  const match = JSON.stringify(aVal) === JSON.stringify(bVal);
  console.log(`  ${match ? '✓' : '✗'} ${f}: host=${summarizeValue(aVal)}  client=${summarizeValue(bVal)}`);
}

if (fieldPaths.length > 0) {
  // Zoomed field view
  console.log('\n[Zoomed fields]');
  for (const fp of fieldPaths) {
    const aVal = getNestedValue(hostState, fp);
    const bVal = getNestedValue(clientState, fp);
    const diffs = deepDiff(aVal, bVal, fp);
    if (diffs.length === 0) {
      console.log(`  ✓ ${fp}: identical`);
    } else {
      console.log(`  ✗ ${fp}: ${diffs.length} difference(s)`);
      for (const d of diffs.slice(0, 40)) {
        console.log(`      ${d.path}`);
        console.log(`        host:   ${summarizeValue(d.a)}`);
        console.log(`        client: ${summarizeValue(d.b)}`);
      }
      if (diffs.length > 40) console.log(`      … (${diffs.length - 40} more differences)`);
    }
  }
} else {
  // Full top-level diff
  const allDiffs = deepDiff(hostState, clientState);
  const byTopKey = new Map();
  for (const d of allDiffs) {
    const top = d.path.split(/[.[]/)[0];
    if (!byTopKey.has(top)) byTopKey.set(top, []);
    byTopKey.get(top).push(d);
  }

  const diverging = [...byTopKey.entries()].filter(([, v]) => v.length > 0);

  // Also find top-level keys that are identical (not in allDiffs)
  const allKeys = new Set([...Object.keys(hostState), ...Object.keys(clientState)]);
  const identicalKeys = [...allKeys].filter(k => !byTopKey.has(k));

  if (allDiffs.length === 0) {
    console.log('\n✓ States are identical.\n');
  } else {
    console.log(`\n[Diverging top-level fields]  (${diverging.length} of ${allKeys.size} keys differ)`);
    for (const [key, diffs] of diverging) {
      console.log(`\n  ✗ ${key}  (${diffs.length} difference(s))`);
      for (const d of diffs.slice(0, 20)) {
        console.log(`      ${d.path}`);
        console.log(`        host:   ${summarizeValue(d.a)}`);
        console.log(`        client: ${summarizeValue(d.b)}`);
      }
      if (diffs.length > 20) console.log(`      … and ${diffs.length - 20} more. Use --field ${key} to see all.`);
    }

    console.log(`\n[Identical top-level fields]  (${identicalKeys.length} keys)`);
    console.log(' ', identicalKeys.join(', ') || '(none)');
  }
}
console.log('');
