#!/usr/bin/env node
/**
 * desyncDebug-getTick: Extract per-tick game state snapshots from user_state logs for a given lobby.
 *
 * Usage:
 *   npm run desyncDebug-getTick -- --lobby <LOBBY_CODE> --from <tick> --to <tick> [--field <dotPath>] [--player <id>]
 *
 * Examples:
 *   npm run desyncDebug-getTick -- --lobby 2BE552 --from 638 --to 648
 *   npm run desyncDebug-getTick -- --lobby 2BE552 --from 638 --to 648 --field lightSources
 *   npm run desyncDebug-getTick -- --lobby 2BE552 --from 638 --to 648 --field lightSources --player 8
 *
 * Options:
 *   --lobby     (required) Lobby code, e.g. 2BE552
 *   --from      (required) Start tick (inclusive)
 *   --to        (required) End tick (inclusive)
 *   --field     (optional) Dot-path into game_state to extract, e.g. "lightSources" or "units.0.hp"
 *               When omitted, prints a compact summary of each tick.
 *   --player    (optional) Restrict to a single player id (sub-directory name under user_state/).
 *               When omitted, reads all players and shows them side-by-side.
 *   --full      (optional) Print the full game_state JSON for each tick (ignores --field).
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
const fromTick  = parseInt(getArg('--from') ?? '', 10);
const toTick    = parseInt(getArg('--to')   ?? '', 10);
const fieldPath = getArg('--field') ?? null;
const playerId  = getArg('--player') ?? null;
const fullMode  = args.includes('--full');

if (!lobbyCode || isNaN(fromTick) || isNaN(toTick)) {
  console.error('Usage: npm run desyncDebug-getTick -- --lobby <CODE> --from <N> --to <M> [--field <path>] [--player <id>] [--full]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dot-path like "lightSources" or "units.0.hp" into a value. */
function getField(obj, dotPath) {
  return dotPath.split('.').reduce((cur, key) => (cur == null ? cur : cur[key]), obj);
}

/** Which user_state_NNN.md file covers a given tick? */
function fileIndexForTick(tick) {
  return Math.floor(tick / 100) + 1;
}

/** Zero-pad to three digits, e.g. 7 → "007". */
function pad3(n) {
  return String(n).padStart(3, '0');
}

/**
 * Read all entries in [fromTick, toTick] from a player's user_state directory.
 * Spans multiple files automatically.
 */
function readPlayerEntries(playerDir, from, to) {
  const startFile = fileIndexForTick(from);
  const endFile   = fileIndexForTick(to);
  const entries   = [];

  for (let fi = startFile; fi <= endFile; fi++) {
    const filePath = path.join(playerDir, `user_state_${pad3(fi)}.md`);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj;
      try { obj = JSON.parse(trimmed); } catch { continue; }
      const tick = obj.tick ?? -1;
      if (tick >= from && tick <= to) {
        entries.push(obj);
      }
    }
  }

  entries.sort((a, b) => a.tick - b.tick);
  return entries;
}

// ---------------------------------------------------------------------------
// Collect players
// ---------------------------------------------------------------------------
const userStateRoot = path.join(rootDir, 'storage', 'lobbies', lobbyCode, 'user_state');
if (!fs.existsSync(userStateRoot)) {
  console.error(`No user_state directory found at: ${userStateRoot}`);
  process.exit(1);
}

const allPlayers = fs.readdirSync(userStateRoot).filter(name => {
  return fs.statSync(path.join(userStateRoot, name)).isDirectory();
});

const players = playerId ? allPlayers.filter(p => p === String(playerId)) : allPlayers;

if (players.length === 0) {
  console.error(`No player directories found${playerId ? ` matching id ${playerId}` : ''}.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read & display
// ---------------------------------------------------------------------------

/** Compact one-liner value for display */
function summarize(value) {
  if (value === undefined) return '(missing)';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

// Collect data per player
const playerData = {};
for (const pid of players) {
  const dir = path.join(userStateRoot, pid);
  playerData[pid] = readPlayerEntries(dir, fromTick, toTick);
}

// Build a sorted union of all ticks seen
const allTicks = [...new Set(
  players.flatMap(pid => playerData[pid].map(e => e.tick))
)].sort((a, b) => a - b);

if (allTicks.length === 0) {
  console.log(`No entries found for ticks ${fromTick}–${toTick} in lobby ${lobbyCode}.`);
  process.exit(0);
}

console.log(`\nLobby ${lobbyCode} | ticks ${fromTick}–${toTick} | players: ${players.join(', ')}`);
if (fieldPath) console.log(`Showing field: ${fieldPath}\n`);
else if (!fullMode) console.log(`Showing summary (use --field <path> or --full for details)\n`);

for (const tick of allTicks) {
  const perPlayer = players.map(pid => {
    const entry = playerData[pid].find(e => e.tick === tick);
    if (!entry) return { pid, value: '(no entry)', gs: null };
    const gs = entry.game_state ?? {};
    const value = fieldPath ? getField(gs, fieldPath) : gs;
    return { pid, value, gs };
  });

  // Check if all players agree on the field
  const rawValues = perPlayer.map(p => JSON.stringify(
    fieldPath ? p.value : { roundNumber: p.gs?.roundNumber, snapshotIndex: p.gs?.snapshotIndex }
  ));
  const allAgree = rawValues.every(v => v === rawValues[0]);
  const marker   = players.length > 1 && !allAgree ? ' *** DESYNC ***' : '';

  console.log(`tick ${tick}${marker}`);
  for (const { pid, value, gs } of perPlayer) {
    if (fullMode) {
      console.log(`  player ${pid}:`);
      console.log(JSON.stringify(value, null, 4).split('\n').map(l => '    ' + l).join('\n'));
    } else if (fieldPath) {
      console.log(`  player ${pid}: ${summarize(value)}`);
      // If it's a non-empty array and there's a desync, print full content
      if (!allAgree && Array.isArray(value) && value.length > 0) {
        console.log('    ' + JSON.stringify(value, null, 2).split('\n').join('\n    '));
      }
    } else {
      const snap = gs?.snapshotIndex ?? '?';
      const round = gs?.roundNumber ?? '?';
      console.log(`  player ${pid}: round=${round} snap=${snap}`);
    }
  }
}
