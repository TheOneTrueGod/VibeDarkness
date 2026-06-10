#!/usr/bin/env node
/**
 * desyncDebug-getCombatEvents: Diff battle snapshots (or user_state logs) tick-by-tick to find
 * unit deaths and spawns, and list the client-side Effect-layer VFX that would have fired.
 *
 * Effects are not serialized in checkpoints — this script infers events from unit changes.
 *
 * Usage:
 *   npm run desyncDebug-getCombatEvents -- --lobby <CODE> --from <tick> --to <tick>
 *   npm run desyncDebug-getCombatEvents -- --lobby <CODE> --last <N>
 *
 * Options:
 *   --lobby       (required) Lobby code, e.g. F17054
 *   --from        Start tick (inclusive). With --to, diffs each consecutive snapshot pair in range.
 *   --to          End tick (inclusive).
 *   --last        Use the N most recent snapshots instead of --from/--to.
 *   --source      "snapshots" (default) or "user_state"
 *   --player      Player id for user_state source (default: first directory found)
 *   --near        Only show events within this many world-px of the local player unit
 *
 * Examples:
 *   npm run desyncDebug-getCombatEvents -- --lobby F17054 --last 5
 *   npm run desyncDebug-getCombatEvents -- --lobby F17054 --from 870 --to 992
 *   npm run desyncDebug-getCombatEvents -- --lobby F17054 --from 870 --to 992 --near 200
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
const fromTick = parseInt(getArg('--from') ?? '', 10);
const toTick = parseInt(getArg('--to') ?? '', 10);
const lastN = parseInt(getArg('--last') ?? '', 10);
const source = getArg('--source') ?? 'snapshots';
const playerId = getArg('--player');
const nearPx = getArg('--near') != null ? parseFloat(getArg('--near')) : null;

if (!lobbyCode || (isNaN(lastN) && (isNaN(fromTick) || isNaN(toTick)))) {
  console.error(
    'Usage: npm run desyncDebug-getCombatEvents -- --lobby <CODE> (--from <N> --to <M> | --last <N>)',
  );
  console.error('       [--source snapshots|user_state] [--player <id>] [--near <px>]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Expected death VFX (mirrors unitDef.ts deathEffect entries + alpha_wolf special case)
// ---------------------------------------------------------------------------
const DEATH_VFX_BY_CHARACTER = {
  enemy_ranged: 'DarkCreatureIconDeath + ~5 purple ParticleImage (darkBlob)',
  dark_wolf: 'DarkCreatureIconDeath + ~5 purple ParticleImage (darkBlob)',
  alpha_wolf: 'AlphaWolfStoryRemnant + AlphaWolfStoryEmitter (radial/homing purple particles, purple Pulse on arrival)',
  boar: '~5 purple ParticleImage burst (ParticleExplosion)',
  thornbinder: 'DarkCreatureIconDeath + ~5 purple ParticleImage (darkBlob)',
  husk_artillery: '~5 purple ParticleImage burst (ParticleExplosion)',
  huskling: 'DarkCreatureIconDeath + ~4 purple ParticleImage (darkBlob)',
  swarmling: 'DarkCreatureIconDeath + ~4 purple ParticleImage (darkBlob)',
};

const DARKNESS_SPAWN_VFX =
  'spawnAnimation: ~20/sec purple ParticleImage (darkBlob, tint 0x9933cc) for 0.5s at unit position';

function expectedDeathVfx(characterId) {
  return DEATH_VFX_BY_CHARACTER[characterId] ?? '(no deathEffect on unit def — no standard burst)';
}

// ---------------------------------------------------------------------------
// Snapshot / user_state loading
// ---------------------------------------------------------------------------
function pad3(n) {
  return String(n).padStart(3, '0');
}

function normalizeGameState(raw) {
  if (!raw) return null;
  return raw.state ?? raw.game_state ?? raw;
}

function unitSnapshot(u) {
  return {
    id: u.id,
    characterId: u.characterId ?? '?',
    name: u.name ?? u.characterId ?? '?',
    teamId: u.teamId ?? '?',
    hp: u.hp ?? 0,
    active: u.active !== false,
    x: u.x ?? 0,
    y: u.y ?? 0,
    spawnTimer: u.spawnTimer ?? 0,
  };
}

function isAlive(u) {
  return u.active && u.hp > 0;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function findPlayerUnit(units) {
  return units.find((u) => u.teamId === 'player' && u.characterId === 'player' && isAlive(u))
    ?? units.find((u) => u.teamId === 'player' && isAlive(u))
    ?? null;
}

function loadSnapshotTick(tick) {
  const filePath = path.join(rootDir, 'storage', 'lobbies', lobbyCode, 'snapshots', `${tick}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const gs = normalizeGameState(raw);
  if (!gs) return null;
  return {
    tick: gs.gameTick ?? raw.tick ?? tick,
    gameTime: gs.gameTime ?? null,
    roundNumber: gs.roundNumber ?? null,
    units: (gs.units ?? []).map(unitSnapshot),
  };
}

function fileIndexForTick(tick) {
  return Math.floor(tick / 100) + 1;
}

function loadUserStateTick(tick, pid) {
  const filePath = path.join(
    rootDir,
    'storage',
    'lobbies',
    lobbyCode,
    'user_state',
    String(pid),
    `user_state_${pad3(fileIndexForTick(tick))}.md`,
  );
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.tick !== tick) continue;
    const gs = normalizeGameState(obj);
    return {
      tick,
      gameTime: gs.gameTime ?? null,
      roundNumber: gs.roundNumber ?? null,
      units: (gs.units ?? []).map(unitSnapshot),
    };
  }
  return null;
}

function listSnapshotTicks() {
  const dir = path.join(rootDir, 'storage', 'lobbies', lobbyCode, 'snapshots');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => parseInt(f.replace('.json', ''), 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
}

function resolvePlayerId() {
  const root = path.join(rootDir, 'storage', 'lobbies', lobbyCode, 'user_state');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
  if (playerId) return dirs.includes(String(playerId)) ? String(playerId) : null;
  return dirs[0] ?? null;
}

function loadTick(tick) {
  if (source === 'user_state') {
    const pid = resolvePlayerId();
    if (!pid) return null;
    return loadUserStateTick(tick, pid);
  }
  return loadSnapshotTick(tick);
}

// ---------------------------------------------------------------------------
// Event detection between two consecutive frames
// ---------------------------------------------------------------------------
function diffFrames(prev, next) {
  const events = [];
  const prevById = new Map(prev.units.map((u) => [u.id, u]));
  const nextById = new Map(next.units.map((u) => [u.id, u]));
  const player = findPlayerUnit(next.units) ?? findPlayerUnit(prev.units);

  for (const [id, was] of prevById) {
    const now = nextById.get(id);
    if (isAlive(was) && (!now || !isAlive(now))) {
      events.push({
        kind: 'death',
        unitId: id,
        characterId: was.characterId,
        name: was.name,
        teamId: was.teamId,
        x: was.x,
        y: was.y,
        vfx: expectedDeathVfx(was.characterId),
      });
    }
  }

  for (const [id, now] of nextById) {
    const was = prevById.get(id);
    if (!was) {
      events.push({
        kind: 'spawn',
        unitId: id,
        characterId: now.characterId,
        name: now.name,
        teamId: now.teamId,
        x: now.x,
        y: now.y,
        spawnTimer: now.spawnTimer,
        vfx: now.spawnTimer > 0 ? DARKNESS_SPAWN_VFX : '(unit added — no spawn animation if not darknessSpawn)',
      });
      continue;
    }
    if (was.spawnTimer <= 0 && now.spawnTimer > 0) {
      events.push({
        kind: 'spawn_anim_start',
        unitId: id,
        characterId: now.characterId,
        name: now.name,
        teamId: now.teamId,
        x: now.x,
        y: now.y,
        spawnTimer: now.spawnTimer,
        vfx: DARKNESS_SPAWN_VFX,
      });
    }
  }

  if (nearPx != null && player) {
    return events.filter((e) => dist(e.x, e.y, player.x, player.y) <= nearPx);
  }
  return events;
}

function formatEvent(e, player) {
  const pos = `(${Math.round(e.x)}, ${Math.round(e.y)})`;
  const near =
    player != null ? ` | ${Math.round(dist(e.x, e.y, player.x, player.y))}px from player` : '';
  const label = e.kind === 'death' ? 'DEATH' : e.kind === 'spawn' ? 'SPAWN' : 'SPAWN_ANIM';
  return [
    `  [${label}] ${e.name} (${e.characterId}, ${e.unitId}) ${pos}${near}`,
    `    team=${e.teamId}${e.spawnTimer != null && e.spawnTimer > 0 ? ` spawnTimer=${e.spawnTimer}` : ''}`,
    `    expected VFX: ${e.vfx}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let tickPairs = [];

if (!isNaN(lastN)) {
  const ticks = listSnapshotTicks();
  if (ticks.length < 2) {
    console.error(`Need at least 2 snapshots in storage/lobbies/${lobbyCode}/snapshots/`);
    process.exit(1);
  }
  const slice = ticks.slice(-lastN);
  for (let i = 1; i < slice.length; i++) {
    tickPairs.push([slice[i - 1], slice[i]]);
  }
} else {
  const ticks = listSnapshotTicks().filter((t) => t >= fromTick && t <= toTick);
  if (ticks.length < 2) {
    console.error(`Fewer than 2 snapshots in range ${fromTick}–${toTick}. Available: ${listSnapshotTicks().join(', ')}`);
    process.exit(1);
  }
  for (let i = 1; i < ticks.length; i++) {
    tickPairs.push([ticks[i - 1], ticks[i]]);
  }
}

const lobbyDir = path.join(rootDir, 'storage', 'lobbies', lobbyCode);
if (!fs.existsSync(lobbyDir)) {
  console.error(`Lobby not found: ${lobbyDir}`);
  process.exit(1);
}

console.log(`\nLobby ${lobbyCode} | source=${source} | ${tickPairs.length} frame pair(s)`);
if (nearPx != null) console.log(`Filtering to events within ${nearPx}px of player`);
console.log('(Effects are not in snapshots — VFX lines are inferred from unit defs + spawn code)\n');

let totalEvents = 0;

for (const [tPrev, tNext] of tickPairs) {
  const prev = loadTick(tPrev);
  const next = loadTick(tNext);
  if (!prev || !next) {
    console.log(`tick ${tPrev} → ${tNext}: (missing snapshot data, skipped)`);
    continue;
  }

  const events = diffFrames(prev, next);
  const player = findPlayerUnit(next.units) ?? findPlayerUnit(prev.units);
  const header = [
    `tick ${tPrev} → ${tNext}`,
    `round ${next.roundNumber ?? '?'}`,
    `gameTime ${next.gameTime != null ? next.gameTime.toFixed(2) + 's' : '?'}`,
    player ? `player @ (${Math.round(player.x)}, ${Math.round(player.y)}) hp=${player.hp}` : 'player: (not found)',
  ].join(' | ');

  if (events.length === 0) {
    console.log(`${header}\n  (no deaths/spawns)`);
    continue;
  }

  console.log(`${header}`);
  for (const e of events) {
    console.log(formatEvent(e, player));
    totalEvents++;
  }
  console.log('');
}

if (totalEvents === 0) {
  console.log('No combat spawn/death events in the selected window.');
} else {
  console.log(`Total events: ${totalEvents}`);
  console.log(
    '\nTip: purple full-screen flashes correlate with the Effect layer — look for DEATH/SPAWN rows',
  );
  console.log('whose expected VFX mentions purple ParticleImage or DarkCreatureIconDeath.');
}
