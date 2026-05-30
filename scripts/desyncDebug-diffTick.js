#!/usr/bin/env node
/**
 * desyncDebug-diffTick: Compare two players' game_state at a specific tick and show diverging fields.
 *
 * Usage:
 *   npm run desyncDebug-diffTick -- --lobby <CODE> --tick <N> --playerA <id> --playerB <id>
 *
 * Examples:
 *   npm run desyncDebug-diffTick -- --lobby 2BE552 --tick 969 --playerA 8 --playerB 9
 *
 * Output: a flat list of dot-paths where the two states differ, with A and B values side by side.
 * Arrays are compared element-by-element; if an array length differs it is flagged, then each
 * differing index is shown.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const lobbyCode = getArg('--lobby');
const tick      = parseInt(getArg('--tick') ?? '', 10);
const playerA   = getArg('--playerA');
const playerB   = getArg('--playerB');

if (!lobbyCode || isNaN(tick) || !playerA || !playerB) {
  console.error('Usage: npm run desyncDebug-diffTick -- --lobby <CODE> --tick <N> --playerA <id> --playerB <id>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read one tick entry for a player
// ---------------------------------------------------------------------------
function pad3(n) { return String(n).padStart(3, '0'); }

function readTick(playerId) {
  const fileIdx  = Math.floor(tick / 100) + 1;
  const filePath = path.join(
    rootDir, 'storage', 'lobbies', lobbyCode,
    'user_state', String(playerId), `user_state_${pad3(fileIdx)}.md`
  );
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.tick === tick) return obj.game_state ?? {};
  }
  console.error(`Tick ${tick} not found for player ${playerId}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Deep diff — returns array of { path, a, b }
// ---------------------------------------------------------------------------
function diff(a, b, prefix = '') {
  const diffs = [];

  if (typeof a !== typeof b) {
    diffs.push({ path: prefix, a, b });
    return diffs;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({ path: `${prefix}[length]`, a: a.length, b: b.length });
    }
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      diffs.push(...diff(a[i], b[i], `${prefix}[${i}]`));
    }
    return diffs;
  }

  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      diffs.push(...diff(a[key], b[key], childPath));
    }
    return diffs;
  }

  // Primitives
  if (!Object.is(a, b)) {
    diffs.push({ path: prefix, a, b });
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const gsA = readTick(playerA);
const gsB = readTick(playerB);

const diffs = diff(gsA, gsB);

if (diffs.length === 0) {
  console.log(`\nLobby ${lobbyCode} tick ${tick}: players ${playerA} and ${playerB} are IDENTICAL.\n`);
} else {
  console.log(`\nLobby ${lobbyCode} tick ${tick}: ${diffs.length} differing field(s) (A=player ${playerA}, B=player ${playerB})\n`);
  for (const { path: p, a, b } of diffs) {
    const av = JSON.stringify(a) ?? 'undefined';
    const bv = JSON.stringify(b) ?? 'undefined';
    console.log(`  ${p}`);
    console.log(`    A: ${av}`);
    console.log(`    B: ${bv}`);
  }
}
