#!/usr/bin/env node
/**
 * desyncDebug-desyncs: Auto-detect fingerprint mismatch events in lobby_log.jsonl and
 * bundle related context (fingerprints, orders, nearby snapshots) for each one.
 *
 * Usage:
 *   npm run desyncDebug-desyncs -- --lobby <CODE> [--window <ticks>]
 *
 * Options:
 *   --lobby    (required) Lobby code, e.g. A381D4
 *   --window   (optional) Ticks before/after each desync to include (default: 20)
 *
 * Examples:
 *   npm run desyncDebug-desyncs -- --lobby A381D4
 *   npm run desyncDebug-desyncs -- --lobby A381D4 --window 30
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

const lobbyCode = getArg('--lobby');
const window_   = parseInt(getArg('--window') ?? '20', 10);

if (!lobbyCode) {
  console.error('Usage: npm run desyncDebug-desyncs -- --lobby <CODE> [--window <ticks>]');
  process.exit(1);
}

const lobbyDir = path.join(rootDir, 'storage', 'lobbies', lobbyCode);
if (!fs.existsSync(lobbyDir)) {
  console.error(`Lobby not found: ${lobbyDir}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonlSync(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed */ }
  }
  return out;
}

function extractTick(obj) {
  return obj.tick ?? obj.gameTick ?? obj.atTick ?? obj.context?.engineTick ?? obj.context?.tick ?? null;
}

function isDesyncEvent(obj) {
  const msg = (obj.message ?? '').toLowerCase();
  const logType = String(obj.logType ?? obj.context?.logType ?? '').toLowerCase();
  if (logType === 'desync') return true;
  if (msg.includes('desync detected') || msg.includes('stuck pause plane')) return true;
  return msg.includes('fingerprint') && (msg.includes('mismatch') || msg.includes('desync') || msg.includes('resync'));
}

function listSnapshotTicks(dir) {
  const snapDir = path.join(dir, 'snapshots');
  if (!fs.existsSync(snapDir)) return [];
  return fs.readdirSync(snapDir)
    .filter(f => /^\d+\.json$/.test(f))
    .map(f => parseInt(f, 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Main: read lobby_log line-by-line, collect desync events
// ---------------------------------------------------------------------------

const logPath = path.join(lobbyDir, 'lobby_log.jsonl');
if (!fs.existsSync(logPath)) {
  console.error(`lobby_log.jsonl not found: ${logPath}`);
  process.exit(1);
}

// Collect all log lines first so we can do range queries
const allLogLines = readJsonlSync(logPath);
const desyncs = allLogLines.filter(isDesyncEvent);

if (desyncs.length === 0) {
  console.log(`\nLobby ${lobbyCode}: no fingerprint mismatch events found in lobby_log.jsonl`);
  console.log('(Log may be empty or below the severity threshold — check LOBBY_LOG_BATTLE_SYNC in global_constants.js)');
  process.exit(0);
}

console.log(`\nLobby ${lobbyCode} | ${desyncs.length} desync event(s) found | window=±${window_} ticks\n`);

// Load fingerprints and orders once
const fingerprints = readJsonlSync(path.join(lobbyDir, 'fingerprints.jsonl'));
const orders       = readJsonlSync(path.join(lobbyDir, 'applied_orders.jsonl'));
const snapshotTicks = listSnapshotTicks(lobbyDir);

for (let i = 0; i < desyncs.length; i++) {
  const event = desyncs[i];
  const tick  = extractTick(event) ?? event.context?.engineTick ?? null;

  console.log(`${'─'.repeat(72)}`);
  console.log(`DESYNC ${i + 1}/${desyncs.length}  tick=${tick ?? '(unknown)'}`);
  console.log(`${'─'.repeat(72)}`);
  console.log('\n[Event]');
  console.log(JSON.stringify(event, null, 2));

  if (tick == null) {
    console.log('\n(Cannot determine tick — skipping context bundle)\n');
    continue;
  }

  const lo = tick - window_;
  const hi = tick + window_;

  // Fingerprints in window
  const fpWindow = fingerprints.filter(f => {
    const t = extractTick(f) ?? -1;
    return t >= lo && t <= hi;
  });
  console.log(`\n[Fingerprints  ticks ${lo}–${hi}]  (${fpWindow.length} entries)`);
  if (fpWindow.length === 0) {
    console.log('  (none — fingerprints.jsonl may be absent or not cover this range)');
  } else {
    for (const fp of fpWindow) console.log(' ', JSON.stringify(fp));
  }

  // Orders in window
  const ordersWindow = orders.filter(o => {
    const t = extractTick(o) ?? -1;
    return t >= lo && t <= hi;
  });
  console.log(`\n[Orders  ticks ${lo}–${hi}]  (${ordersWindow.length} entries)`);
  if (ordersWindow.length === 0) {
    console.log('  (none)');
  } else {
    for (const o of ordersWindow) console.log(' ', JSON.stringify(o));
  }

  // Nearby log entries (excluding the desync event itself)
  const logWindow = allLogLines.filter(l => {
    if (l === event) return false;
    const t = extractTick(l) ?? -1;
    return t >= lo && t <= hi;
  });
  console.log(`\n[Nearby log entries  ticks ${lo}–${hi}]  (${logWindow.length} entries)`);
  if (logWindow.length === 0) {
    console.log('  (none)');
  } else {
    for (const l of logWindow) console.log(' ', JSON.stringify(l));
  }

  // Available snapshots near the desync tick
  const nearSnaps = snapshotTicks.filter(t => t >= lo && t <= hi);
  const nearestSnap = snapshotTicks.reduce((best, t) => {
    if (best == null) return t;
    return Math.abs(t - tick) < Math.abs(best - tick) ? t : best;
  }, null);

  console.log(`\n[Snapshots near tick ${tick}]`);
  if (snapshotTicks.length === 0) {
    console.log('  (no snapshots directory)');
  } else {
    console.log(`  In window [${lo}, ${hi}]: ${nearSnaps.length > 0 ? nearSnaps.join(', ') : '(none)'}`);
    console.log(`  Nearest overall: tick ${nearestSnap}`);
    console.log(`  All available: ${snapshotTicks.join(', ')}`);
    if (nearestSnap != null) {
      console.log(`\n  Tip: npm run desyncDebug-diffSnapshot -- --lobby ${lobbyCode} --tick ${nearestSnap} --vs-log ${tick}`);
    }
  }

  console.log('');
}

console.log(`${'─'.repeat(72)}`);
console.log(`${desyncs.length} desync event(s) total.`);
console.log('Next steps:');
console.log('  • If randomSeed matches but fingerprints differ → phantom desync (render-rate counter contamination)');
console.log('  • If randomSeed differs → genuine simulation divergence; check orders and RNG calls');
console.log(`  • npm run desyncDebug-diffSnapshot -- --lobby ${lobbyCode} --tick <snap> --vs-log <tick>`);
console.log('    to compare host snapshot vs client state dump from the log\n');
