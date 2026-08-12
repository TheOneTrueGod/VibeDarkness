#!/usr/bin/env node
/**
 * desyncDebug-traceCast: Trace a unit's casts / interrupts / damage / knockback across
 * host snapshots and/or user_state frames. Use when an ability (e.g. Dodge iframes) looked
 * interrupted or when HP dropped during an expected invuln window.
 *
 * Usage:
 *   npm run desyncDebug-traceCast -- --lobby <CODE> --from <tick> --to <tick>
 *   npm run desyncDebug-traceCast -- --lobby <CODE> --ability <id> [--pad <ticks>]
 *
 * Options:
 *   --lobby     (required) Lobby code
 *   --from/--to Tick range (inclusive). Required unless --ability is set.
 *   --ability   Find applied_orders for this abilityId and expand a window around each.
 *   --pad       Ticks of context around each --ability order (default 30)
 *   --unit      Focus unit id (default: living player hero)
 *   --source    snapshots (default) | user_state | both
 *   --player    user_state player id (default: first under user_state/)
 *   --near      Include enemy casts within this many world-px of the focus unit (default 250)
 *
 * Examples:
 *   npm run desyncDebug-traceCast -- --lobby A83BE2 --ability 0101
 *   npm run desyncDebug-traceCast -- --lobby A83BE2 --from 485 --to 515 --source both
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
const fromArg = parseInt(getArg('--from') ?? '', 10);
const toArg = parseInt(getArg('--to') ?? '', 10);
const abilityFilter = getArg('--ability');
const padTicks = parseInt(getArg('--pad') ?? '30', 10);
const unitFilter = getArg('--unit');
const source = getArg('--source') ?? 'snapshots';
const playerIdArg = getArg('--player');
const nearPx = parseFloat(getArg('--near') ?? '250');

if (!lobbyCode || (!abilityFilter && (isNaN(fromArg) || isNaN(toArg)))) {
  console.error(
    'Usage: npm run desyncDebug-traceCast -- --lobby <CODE> (--from <N> --to <M> | --ability <id>)',
  );
  console.error(
    '       [--pad <ticks>] [--unit <id>] [--source snapshots|user_state|both] [--player <id>] [--near <px>]',
  );
  process.exit(1);
}

if (!['snapshots', 'user_state', 'both'].includes(source)) {
  console.error(`Invalid --source "${source}" (expected snapshots|user_state|both)`);
  process.exit(1);
}

const lobbyDir = path.join(rootDir, 'storage', 'lobbies', lobbyCode);
if (!fs.existsSync(lobbyDir)) {
  console.error(`Lobby not found: ${lobbyDir}`);
  process.exit(1);
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function normalizeGameState(raw) {
  if (!raw) return null;
  return raw.state ?? raw.game_state ?? raw;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function isAlive(u) {
  return u && u.active !== false && (u.hp ?? 0) > 0;
}

function activeAbilityIds(unit) {
  return (unit?.activeAbilities ?? []).map((a) => a.abilityId).filter(Boolean);
}

function activeAbilityMap(unit) {
  const map = new Map();
  for (const a of unit?.activeAbilities ?? []) {
    if (!a?.abilityId) continue;
    map.set(a.abilityId, a);
  }
  return map;
}

function knockbackSummary(kb) {
  if (!kb) return null;
  const src = kb.knockbackSource ?? {};
  return {
    sourceAbilityId: src.abilityId ?? null,
    sourceUnitId: src.unitId ?? null,
    elapsed: kb.knockbackElapsed ?? 0,
    air: kb.knockbackAirTime ?? null,
    slide: kb.knockbackSlideTime ?? null,
  };
}

function summarizeUnit(u) {
  if (!u) return null;
  return {
    id: u.id,
    characterId: u.characterId ?? '?',
    name: u.name ?? u.characterId ?? '?',
    teamId: u.teamId ?? '?',
    hp: u.hp ?? 0,
    maxHp: u.maxHp ?? null,
    x: u.x ?? 0,
    y: u.y ?? 0,
    activeAbilities: (u.activeAbilities ?? []).map((a) => ({
      abilityId: a.abilityId,
      startTime: a.startTime ?? null,
      targets: a.targets ?? null,
    })),
    knockback: knockbackSummary(u.knockback),
    controlled: !!u.controlled,
    waitMinEndTime: u.waitMinEndTime ?? null,
    waitMaxEndTime: u.waitMaxEndTime ?? null,
  };
}

function findFocusUnit(units) {
  if (unitFilter) return units.find((u) => u.id === unitFilter) ?? null;
  return (
    units.find((u) => u.teamId === 'player' && u.characterId === 'player' && isAlive(u)) ??
    units.find((u) => u.teamId === 'player' && isAlive(u)) ??
    null
  );
}

function listSnapshotTicks() {
  const dir = path.join(lobbyDir, 'snapshots');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => parseInt(f.replace('.json', ''), 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
}

function resolvePlayerId() {
  const root = path.join(lobbyDir, 'user_state');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
  if (playerIdArg) return dirs.includes(String(playerIdArg)) ? String(playerIdArg) : null;
  return dirs[0] ?? null;
}

function loadSnapshotFrame(tick) {
  const filePath = path.join(lobbyDir, 'snapshots', `${tick}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const gs = normalizeGameState(raw);
  if (!gs?.units) return null;
  return {
    source: 'snapshots',
    tick: gs.gameTick ?? raw.tick ?? tick,
    gameTime: gs.gameTime ?? null,
    roundNumber: gs.roundNumber ?? null,
    units: gs.units,
  };
}

function loadUserStateFrame(tick, pid) {
  const filePath = path.join(lobbyDir, 'user_state', String(pid), `user_state_${pad3(Math.floor(tick / 100) + 1)}.md`);
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
    if (!gs?.units) return null;
    return {
      source: 'user_state',
      tick,
      gameTime: gs.gameTime ?? null,
      roundNumber: gs.roundNumber ?? null,
      units: gs.units,
    };
  }
  return null;
}

function loadAppliedOrders() {
  const filePath = path.join(lobbyDir, 'applied_orders.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const out = [];
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return out;
}

function resolveWindows() {
  if (!abilityFilter) return [{ from: fromArg, to: toArg, reason: 'explicit range' }];
  const orders = loadAppliedOrders().filter((o) => o?.order?.abilityId === abilityFilter);
  if (orders.length === 0) {
    console.error(`No applied_orders with abilityId=${abilityFilter}`);
    process.exit(1);
  }
  return orders.map((o) => {
    const at = o.atTick ?? o.tick ?? o.gameTick;
    return {
      from: Math.max(1, at - padTicks),
      to: at + padTicks,
      reason: `ability ${abilityFilter} ordered at tick ${at}`,
      orderTick: at,
      order: o,
    };
  });
}

function nearbyEnemyCasts(focus, units, gameTime) {
  if (!focus) return [];
  const out = [];
  for (const u of units) {
    if (!isAlive(u) || u.teamId === focus.teamId) continue;
    const d = dist(focus.x, focus.y, u.x, u.y);
    if (d > nearPx) continue;
    for (const a of u.activeAbilities ?? []) {
      out.push({
        unitId: u.id,
        characterId: u.characterId,
        name: u.name,
        abilityId: a.abilityId,
        startTime: a.startTime ?? null,
        elapsed: a.startTime != null && gameTime != null ? gameTime - a.startTime : null,
        dist: Math.round(d),
        x: u.x,
        y: u.y,
        targets: a.targets ?? null,
      });
    }
  }
  out.sort((a, b) => a.dist - b.dist || a.unitId.localeCompare(b.unitId));
  return out;
}

function diffFocus(prevFrame, nextFrame, focusId) {
  const events = [];
  const prevUnit = prevFrame.units.find((u) => u.id === focusId) ?? null;
  const nextUnit = nextFrame.units.find((u) => u.id === focusId) ?? null;
  if (!prevUnit && !nextUnit) return events;

  const prev = summarizeUnit(prevUnit);
  const next = summarizeUnit(nextUnit);
  const prevMap = activeAbilityMap(prevUnit);
  const nextMap = activeAbilityMap(nextUnit);

  for (const [abilityId, a] of nextMap) {
    if (!prevMap.has(abilityId)) {
      events.push({
        kind: 'ability_started',
        abilityId,
        startTime: a.startTime ?? null,
      });
    }
  }
  for (const [abilityId, a] of prevMap) {
    if (!nextMap.has(abilityId)) {
      events.push({
        kind: 'ability_ended',
        abilityId,
        startTime: a.startTime ?? null,
        endedByTick: nextFrame.tick,
      });
    }
  }

  if (prev && next && next.hp < prev.hp) {
    events.push({
      kind: 'hp_lost',
      amount: prev.hp - next.hp,
      hpBefore: prev.hp,
      hpAfter: next.hp,
      duringAbilities: activeAbilityIds(prevUnit),
    });
  }

  if (prev && next) {
    const disp = dist(prev.x, prev.y, next.x, next.y);
    if (disp >= 0.5) {
      events.push({
        kind: 'moved',
        displacement: Math.round(disp * 100) / 100,
        from: { x: Math.round(prev.x * 10) / 10, y: Math.round(prev.y * 10) / 10 },
        to: { x: Math.round(next.x * 10) / 10, y: Math.round(next.y * 10) / 10 },
      });
    }
  }

  const prevKb = prev?.knockback;
  const nextKb = next?.knockback;
  if (!prevKb && nextKb) {
    events.push({ kind: 'knockback_started', knockback: nextKb });
  } else if (prevKb && !nextKb) {
    events.push({ kind: 'knockback_cleared', knockbackWas: prevKb });
  } else if (prevKb && nextKb) {
    const prevSrc = `${prevKb.sourceAbilityId}|${prevKb.sourceUnitId}`;
    const nextSrc = `${nextKb.sourceAbilityId}|${nextKb.sourceUnitId}`;
    if (prevSrc !== nextSrc || (nextKb.elapsed ?? 0) < (prevKb.elapsed ?? 0)) {
      events.push({ kind: 'knockback_replaced', knockback: nextKb, previous: prevKb });
    }
  }

  if (prev && next && !prev.controlled && next.controlled) {
    events.push({ kind: 'controlled_started' });
  }
  if (prev && next && prev.controlled && !next.controlled) {
    events.push({ kind: 'controlled_cleared' });
  }

  if (prev && next) {
    const prevWait = prev.waitMinEndTime != null || prev.waitMaxEndTime != null;
    const nextWait = next.waitMinEndTime != null || next.waitMaxEndTime != null;
    if (!prevWait && nextWait) {
      events.push({
        kind: 'wait_lockout_started',
        waitMinEndTime: next.waitMinEndTime,
        waitMaxEndTime: next.waitMaxEndTime,
      });
    } else if (prevWait && !nextWait) {
      events.push({ kind: 'wait_lockout_cleared' });
    }
  }

  const enemyCasts = nearbyEnemyCasts(nextUnit ?? prevUnit, nextFrame.units, nextFrame.gameTime);
  if (enemyCasts.length > 0 && events.some((e) => e.kind === 'hp_lost' || e.kind === 'ability_ended' || e.kind === 'knockback_started')) {
    events.push({ kind: 'nearby_enemy_casts', casts: enemyCasts });
  }

  return events;
}

function collectTicksForSource(src, from, to) {
  if (src === 'snapshots') {
    return listSnapshotTicks().filter((t) => t >= from && t <= to);
  }
  const pid = resolvePlayerId();
  if (!pid) return [];
  const ticks = [];
  for (let t = from; t <= to; t++) {
    if (loadUserStateFrame(t, pid)) ticks.push(t);
  }
  return ticks;
}

function loadFrame(src, tick) {
  if (src === 'snapshots') return loadSnapshotFrame(tick);
  const pid = resolvePlayerId();
  if (!pid) return null;
  return loadUserStateFrame(tick, pid);
}

function analyzeWindow(window) {
  const sources = source === 'both' ? ['snapshots', 'user_state'] : [source];
  for (const src of sources) {
    const ticks = collectTicksForSource(src, window.from, window.to);
    console.log(`\n=== ${window.reason} | source=${src} | frames=${ticks.length} (${window.from}–${window.to}) ===`);
    if (window.order) {
      console.log(
        `Order @${window.orderTick}: ${JSON.stringify({
          abilityId: window.order.order?.abilityId,
          unitId: window.order.order?.unitId,
          targets: window.order.order?.targets,
          endTurn: window.order.order?.endTurn,
        })}`,
      );
    }
    if (ticks.length === 0) {
      console.log('(no frames in range for this source)');
      continue;
    }
    if (ticks.length === 1) {
      console.log(`(only one frame at tick ${ticks[0]} — need ≥2 to diff)`);
    }

    let focusId = unitFilter;
    const first = loadFrame(src, ticks[0]);
    if (!focusId && first) {
      focusId = findFocusUnit(first.units)?.id ?? null;
    }
    if (!focusId) {
      console.log('(could not resolve focus unit)');
      continue;
    }
    console.log(`Focus unit: ${focusId}`);

    // Opening snapshot
    const openFocus = summarizeUnit(first.units.find((u) => u.id === focusId));
    console.log(
      `tick ${ticks[0]} open: hp=${openFocus?.hp} pos=(${Math.round(openFocus?.x ?? 0)}, ${Math.round(openFocus?.y ?? 0)}) ` +
        `active=[${activeAbilityIds(first.units.find((u) => u.id === focusId)).join(',') || '—'}] ` +
        `kb=${openFocus?.knockback ? JSON.stringify(openFocus.knockback) : 'null'}`,
    );
    const openNearby = nearbyEnemyCasts(
      first.units.find((u) => u.id === focusId),
      first.units,
      first.gameTime,
    );
    if (openNearby.length) {
      console.log('  nearby casts:');
      for (const c of openNearby) {
        console.log(
          `    ${c.name}(${c.unitId}) ${c.abilityId} @${c.dist}px elapsed=${c.elapsed != null ? c.elapsed.toFixed(2) + 's' : '?'}`,
        );
      }
    }

    let sawAbility = false;
    let abilityEndedEarly = false;
    const orderAbility = window.order?.order?.abilityId ?? abilityFilter;

    for (let i = 1; i < ticks.length; i++) {
      const prev = loadFrame(src, ticks[i - 1]);
      const next = loadFrame(src, ticks[i]);
      if (!prev || !next) continue;
      const events = diffFocus(prev, next, focusId);
      if (events.length === 0) continue;

      const nextFocus = summarizeUnit(next.units.find((u) => u.id === focusId));
      console.log(
        `\ntick ${prev.tick} → ${next.tick} (t=${next.gameTime != null ? next.gameTime.toFixed(3) : '?'}s) ` +
          `hp=${nextFocus?.hp} pos=(${Math.round(nextFocus?.x ?? 0)}, ${Math.round(nextFocus?.y ?? 0)})`,
      );
      for (const e of events) {
        if (e.kind === 'ability_started' && orderAbility && e.abilityId === orderAbility) sawAbility = true;
        if (e.kind === 'ability_ended' && orderAbility && e.abilityId === orderAbility) {
          sawAbility = true;
          abilityEndedEarly = true;
        }
        if (e.kind === 'nearby_enemy_casts') {
          console.log('  [nearby_enemy_casts]');
          for (const c of e.casts) {
            console.log(
              `    ${c.name}(${c.unitId}/${c.characterId}) casting ${c.abilityId} @${c.dist}px ` +
                `elapsed=${c.elapsed != null ? c.elapsed.toFixed(2) + 's' : '?'}`,
            );
          }
          continue;
        }
        console.log(`  [${e.kind}] ${JSON.stringify(e)}`);
      }
    }

    if (orderAbility) {
      const last = loadFrame(src, ticks[ticks.length - 1]);
      const lastActive = activeAbilityIds(last?.units.find((u) => u.id === focusId));
      if (lastActive.includes(orderAbility)) sawAbility = true;

      const firstFocus = summarizeUnit(first.units.find((u) => u.id === focusId));
      const lastFocus = summarizeUnit(last?.units.find((u) => u.id === focusId));
      const netDisp =
        firstFocus && lastFocus ? dist(firstFocus.x, firstFocus.y, lastFocus.x, lastFocus.y) : 0;
      const netHpLoss =
        firstFocus && lastFocus ? Math.max(0, firstFocus.hp - lastFocus.hp) : 0;

      // Aim from order pixel target when present.
      let towardOrder = null;
      const orderPos = window.order?.order?.targets?.find((t) => t?.type === 'pixel')?.position;
      if (orderPos && firstFocus && lastFocus && netDisp >= 1) {
        const orderDirX = orderPos.x - firstFocus.x;
        const orderDirY = orderPos.y - firstFocus.y;
        const moveDirX = lastFocus.x - firstFocus.x;
        const moveDirY = lastFocus.y - firstFocus.y;
        const od = Math.hypot(orderDirX, orderDirY) || 1;
        const md = Math.hypot(moveDirX, moveDirY) || 1;
        towardOrder = (orderDirX / od) * (moveDirX / md) + (orderDirY / od) * (moveDirY / md);
      }

      console.log('\n--- Cast verdict ---');
      if (sawAbility && !abilityEndedEarly) {
        console.log(`Ability ${orderAbility} was observed on the focus unit in this window.`);
      } else if (sawAbility && abilityEndedEarly) {
        console.log(`ABILITY ENDED between frames while still in the traced window (${orderAbility}).`);
      } else if (window.orderTick != null && netHpLoss === 0 && towardOrder != null && towardOrder > 0.7 && netDisp >= 40) {
        console.log(
          `LIKELY COMPLETED BETWEEN SPARSE FRAMES: order ${orderAbility} at tick ${window.orderTick} never appears in activeAbilities (pause snapshots), but focus moved ${netDisp.toFixed(0)}px toward the order aim (dot=${towardOrder.toFixed(2)}) with no HP loss.`,
        );
      } else if (window.orderTick != null) {
        console.log(
          `ABILITY NEVER OBSERVED: order ${orderAbility} at tick ${window.orderTick}, but focus never had it in activeAbilities across ${src} frames in this window.`,
        );
        console.log(
          `Net: hpLost=${netHpLoss} displacement=${netDisp.toFixed(1)}px` +
            (towardOrder != null ? ` towardOrderDot=${towardOrder.toFixed(2)}` : ''),
        );
        if (netHpLoss > 0 && netDisp > 0 && netDisp < 40) {
          console.log(
            'Pattern matches short forced movement (e.g. tier-1 knockback ~18px) + damage while the cast left no durable activeAbilities footprint on pause snapshots.',
          );
        }
        console.log('Inspect hp_lost / moved / knockback / nearby casts above for the interrupt source.');
      }

      // Hint known interrupt-capable nearby abilities from the opening frame.
      if (openNearby.length && (netHpLoss > 0 || abilityEndedEarly || !sawAbility)) {
        const hints = [];
        for (const c of openNearby) {
          if (c.abilityId === '0008' || c.abilityId === '0016') {
            hints.push(
              `${c.name} ${c.abilityId} (Thornbinder AoE): damageEnemiesInCircle does not skip iframes; knockback interrupts casts (juggernaut-only immunity).`,
            );
          } else if (c.abilityId === '0003') {
            hints.push(
              `${c.name} ${c.abilityId} (Dark Wolf Bite): ChargeAttack skips iframe targets for damage — less likely to interrupt an active Dodge.`,
            );
          }
        }
        if (hints.length) {
          console.log('Interrupt suspects:');
          for (const h of hints) console.log(`  - ${h}`);
        }
      }
    }
  }
}

const windows = resolveWindows();
console.log(`Lobby ${lobbyCode} | desyncDebug-traceCast | source=${source} | near=${nearPx}px`);
for (const w of windows) analyzeWindow(w);
console.log('');
