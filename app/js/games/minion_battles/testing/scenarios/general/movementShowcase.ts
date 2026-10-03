/**
 * Movement showcase scenarios (pathfinding overhaul): one scenario per behaviour the new
 * pathfinding is meant to deliver, built to be watched in the Ability Test preview as well as run
 * headlessly. Each tracks what it measures from `assertPass` (the runner calls it once per tick)
 * and prints the numbers on failure.
 *
 * Enemies use the `hunt` tree (pursue relentlessly, no perception limit) and are sped up where a
 * scenario would otherwise take too long to watch.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { TerrainType } from '../../../terrain/TerrainType';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { buildPlayerMovePathThroughWaypoints } from '../../../terrain/playerMovePath';
import { WAIT_ABILITY_MODE_FAR } from '../../../abilities/WaitAbility';
import { MIN_FOLLOW_RADIUS } from '../../../game/gameConstants';

const CELL = 40;
const SECTION = 'Movement';

// ─── Shared setup ───────────────────────────────────────────────────────────

const centre = (col: number, row: number) => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });
const cellOf = (u: { x: number; y: number }) => ({ col: Math.floor(u.x / CELL), row: Math.floor(u.y / CELL) });

function buildEngine(gridW: number, gridH: number): GameEngine {
    return buildTinyBattleEngine({ gridW, gridH, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
}

/** A stationary player that keeps the real-time sim running (waits) and never runs AI. */
function spawnIdlePlayer(engine: GameEngine, col: number, row: number, waitUntilTick = 1800): Unit {
    const { x, y } = centre(col, row);
    const player = spawnTinyPlayerUnit(engine, { playerId: TINY_BATTLE_PLAYER_ID, x, y, abilities: [] });
    player.unitAITreeId = 'static_test_no_ai';
    for (let tick = 90; tick <= waitUntilTick; tick += 90) {
        engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
    }
    return player;
}

/** A player that only moves when ordered (no AI). */
function spawnOrderedPlayer(engine: GameEngine, col: number, row: number): Unit {
    const { x, y } = centre(col, row);
    const player = spawnTinyPlayerUnit(engine, { playerId: TINY_BATTLE_PLAYER_ID, x, y, abilities: [] });
    player.unitAITreeId = 'static_test_no_ai';
    return player;
}

/** A melee chaser on the `hunt` tree, optionally sped up so the scenario is quick to watch. */
function spawnChaser(engine: GameEngine, id: string, x: number, y: number, speed?: number, moveJitter?: number): Unit {
    const chaser = createUnitFromSpawnConfig(
        {
            id,
            characterId: 'swarmling',
            name: 'Chaser',
            x,
            y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            unitAITreeId: 'hunt',
            aiSettings: { minRange: 0, maxRange: 60 },
        },
        engine.eventBus,
    );
    initializeAbilityRuntimeForUnit(chaser);
    engine.addUnit(chaser, 'initialGameSpawn');
    if (speed !== undefined) chaser.speed = speed;
    if (moveJitter !== undefined) chaser.moveJitter = moveJitter;
    return chaser;
}

/** An AI-less unit the scenario steers with walk goals. */
function spawnWalker(engine: GameEngine, id: string, col: number, row: number, speed: number): Unit {
    const { x, y } = centre(col, row);
    const walker = createUnitFromSpawnConfig(
        {
            id,
            characterId: 'swarmling',
            name: 'Walker',
            x,
            y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            unitAITreeId: 'static_test_no_ai',
        },
        engine.eventBus,
    );
    initializeAbilityRuntimeForUnit(walker);
    engine.addUnit(walker, 'initialGameSpawn');
    walker.speed = speed;
    return walker;
}

function setRock(tm: TerrainManager, cells: [number, number][]): void {
    for (const [col, row] of cells) tm.grid.set(col, row, TerrainType.Rock);
    tm.clearPathCache();
}

function cellsInRect(col0: number, col1: number, row0: number, row1: number): [number, number][] {
    const out: [number, number][] = [];
    for (let col = col0; col <= col1; col++) for (let row = row0; row <= row1; row++) out.push([col, row]);
    return out;
}

/** Length of the smoothed route the pathfinder would plan right now (start -> waypoint centres). */
function plannedRouteLength(tm: TerrainManager, from: { x: number; y: number }, to: { col: number; row: number }): { length: number; bends: number } {
    const route = tm.pathQuery.findPath(from.x, from.y, to.col, to.row, 'enemy', 0) ?? [];
    let length = 0;
    let x = from.x;
    let y = from.y;
    for (const wp of route) {
        const c = centre(wp.col, wp.row);
        length += Math.hypot(c.x - x, c.y - y);
        x = c.x;
        y = c.y;
    }
    return { length, bends: Math.max(0, route.length - 1) };
}

// ─── Per-unit motion tracking ───────────────────────────────────────────────

/** Heading changes sharper than this between consecutive moving ticks count as a "turn". */
const TURN_THRESHOLD_RAD = (25 * Math.PI) / 180;

interface MotionTrack {
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastHeading: number | null;
    travelled: number;
    turns: number;
    /** Largest perpendicular distance from the straight start -> `lineTo` line. */
    maxDeviation: number;
    stall: number;
    maxStall: number;
    /** First cell the unit was ever seen standing in that is not passable. */
    inRock: { col: number; row: number; tick: number } | null;
    /** Set once the unit comes within `arriveDist` of its target; measuring stops then. */
    arrived: boolean;
}

interface Tracker {
    lastTick: number;
    units: Map<string, MotionTrack>;
}

const trackers = new WeakMap<GameEngine, Tracker>();

/**
 * Advance motion tracking for `ids` once per tick. `target` gives the point each unit is heading
 * for (used for deviation, stall and arrival); measuring stops at `arriveDist` from it.
 */
function trackMotion(
    engine: GameEngine,
    ids: readonly string[],
    target: (unit: Unit) => { x: number; y: number },
    arriveDist: number,
): Map<string, MotionTrack> {
    let tracker = trackers.get(engine);
    if (!tracker) {
        tracker = { lastTick: -1, units: new Map() };
        trackers.set(engine, tracker);
    }
    if (tracker.lastTick === engine.gameTick) return tracker.units;
    tracker.lastTick = engine.gameTick;

    const nav = engine.terrainManager!.nav;
    for (const id of ids) {
        const unit = engine.getUnit(id);
        if (!unit?.isAlive()) continue;
        let t = tracker.units.get(id);
        if (!t) {
            t = {
                startX: unit.x, startY: unit.y, lastX: unit.x, lastY: unit.y, lastHeading: null,
                travelled: 0, turns: 0, maxDeviation: 0, stall: 0, maxStall: 0, inRock: null, arrived: false,
            };
            tracker.units.set(id, t);
        }

        const { col, row } = cellOf(unit);
        if (!t.inRock && !nav.isPassable('default', col, row)) t.inRock = { col, row, tick: engine.gameTick };
        if (t.arrived) continue;

        const goal = target(unit);
        const dx = unit.x - t.lastX;
        const dy = unit.y - t.lastY;
        const moved = Math.hypot(dx, dy);
        t.travelled += moved;
        if (moved > 0.2) {
            const heading = Math.atan2(dy, dx);
            if (t.lastHeading !== null) {
                let diff = Math.abs(heading - t.lastHeading);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;
                if (diff > TURN_THRESHOLD_RAD) t.turns++;
            }
            t.lastHeading = heading;
        }
        t.stall = moved < 0.05 ? t.stall + 1 : 0;
        if (t.stall > t.maxStall) t.maxStall = t.stall;

        const lx = goal.x - t.startX;
        const ly = goal.y - t.startY;
        const len = Math.hypot(lx, ly);
        if (len > 0) {
            const dev = Math.abs((unit.x - t.startX) * ly - (unit.y - t.startY) * lx) / len;
            if (dev > t.maxDeviation) t.maxDeviation = dev;
        }
        t.lastX = unit.x;
        t.lastY = unit.y;
        if (Math.hypot(goal.x - unit.x, goal.y - unit.y) <= arriveDist) t.arrived = true;
    }
    return tracker.units;
}

function fmt(n: number): string {
    return n.toFixed(1);
}

// ─── 1. Rock corridors: straight runs and clean bends ───────────────────────

const CORRIDOR_IDS = ['corridor_a', 'corridor_b', 'corridor_c'];
const CORRIDOR_PLAYER = { col: 19, row: 2 };
const CORRIDOR_MAX_LENGTH_RATIO = 1.25;
/** Turns allowed beyond the route's own bends (crowd nudges between three chasers). */
const CORRIDOR_EXTRA_TURNS = 6;

interface CorridorRef { length: number; bends: number }
const corridorRefs = new WeakMap<GameEngine, Map<string, CorridorRef>>();

function corridorReport(engine: GameEngine): string {
    const player = engine.getLocalPlayerUnit();
    if (!player) return 'no player';
    const tracks = trackMotion(engine, CORRIDOR_IDS, () => player, 2 * CELL);
    const refs = corridorRefs.get(engine);
    return CORRIDOR_IDS.map((id) => {
        const t = tracks.get(id);
        const r = refs?.get(id);
        if (!t || !r) return `${id}: no data`;
        return `${id}: arrived=${t.arrived} travelled=${fmt(t.travelled)}/${fmt(r.length)} `
            + `(max ${CORRIDOR_MAX_LENGTH_RATIO}x) turns=${t.turns}/${r.bends + CORRIDOR_EXTRA_TURNS} `
            + `inRock=${t.inRock ? `(${t.inRock.col},${t.inRock.row})` : 'no'}`;
    }).join(' | ') + ` tick=${engine.gameTick}`;
}

/**
 * Three enemies chase the player through a winding three-wide rock corridor with four bends.
 * The old cell-to-cell paths zig-zagged on every diagonal (a "staircase") and doubled back after
 * re-pathing; now each chaser runs straight down each stretch and turns only at the bends.
 */
export const moveRockCorridorRouteScenario: ScenarioDefinition = {
    id: 'move_rock_corridor_route',
    title: 'Rock corridors: straight runs, clean bends, no staircase or U-turn',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 20000,

    buildEngine() {
        const engine = buildEngine(22, 12);
        const tm = engine.terrainManager!;
        // Solid rock, then carve a three-wide winding corridor.
        setRock(tm, cellsInRect(0, 21, 0, 11));
        const carve = (c0: number, c1: number, r0: number, r1: number) => {
            for (const [col, row] of cellsInRect(c0, c1, r0, r1)) tm.grid.set(col, row, TerrainType.Grass);
        };
        carve(1, 6, 1, 3);
        carve(4, 6, 1, 9);
        carve(4, 16, 7, 9);
        carve(14, 16, 1, 9);
        carve(14, 20, 1, 3);
        tm.clearPathCache();

        const player = spawnIdlePlayer(engine, CORRIDOR_PLAYER.col, CORRIDOR_PLAYER.row);
        const starts = [centre(1, 2), centre(2, 1), centre(2, 3)];
        const refs = new Map<string, CorridorRef>();
        CORRIDOR_IDS.forEach((id, i) => {
            spawnChaser(engine, id, starts[i]!.x, starts[i]!.y, 120, 0.15 + i * 0.35);
            refs.set(id, plannedRouteLength(tm, starts[i]!, cellOf(player)));
        });
        corridorRefs.set(engine, refs);
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        const refs = corridorRefs.get(engine);
        if (!player || !refs) return false;
        const tracks = trackMotion(engine, CORRIDOR_IDS, () => player, 2 * CELL);
        return CORRIDOR_IDS.every((id) => {
            const t = tracks.get(id);
            const r = refs.get(id)!;
            return !!t && t.arrived && !t.inRock
                && t.travelled <= CORRIDOR_MAX_LENGTH_RATIO * r.length
                && t.turns <= r.bends + CORRIDOR_EXTRA_TURNS;
        });
    },

    failureMessage: corridorReport,
    describeState: corridorReport,
};

// ─── 2. A pack fans out in the open and funnels through a gap ───────────────

const PACK_SIZE = 12;
const PACK_IDS = Array.from({ length: PACK_SIZE }, (_, i) => `pack_${i}`);
const PACK_GAP_ROWS = [6, 7];
const PACK_WALL_COL = 14;
/**
 * Width of the pack across its direction of travel, measured when its centre is half-way to the
 * gap. It starts about 1.5 cells wide; a pack that collapsed into single file would be ~0.3.
 */
const PACK_MIN_SPREAD = 1.25 * CELL;

interface PackTrack {
    startCentroid: { x: number; y: number } | null;
    startSpread: number | null;
    spreadAtMidway: number | null;
    gapRows: Set<number>;
    crossed: Set<string>;
}
const packTracks = new WeakMap<GameEngine, PackTrack>();

function packCentroid(units: Unit[]): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const u of units) { x += u.x; y += u.y; }
    return { x: x / units.length, y: y / units.length };
}

function trackPack(engine: GameEngine): PackTrack | null {
    const track = packTracks.get(engine);
    const player = engine.getLocalPlayerUnit();
    if (!track || !player) return null;
    trackMotion(engine, PACK_IDS, () => player, 3 * CELL);
    const units = PACK_IDS.map((id) => engine.getUnit(id)).filter((u): u is Unit => !!u?.isAlive());
    if (units.length === 0) return track;

    const c = packCentroid(units);
    if (!track.startCentroid) track.startCentroid = c;
    const gap = { x: PACK_WALL_COL * CELL, y: 7 * CELL };
    // Spread across the direction of travel (start centre -> gap).
    const dx = gap.x - track.startCentroid.x;
    const dy = gap.y - track.startCentroid.y;
    const len = Math.hypot(dx, dy);
    const spread = () => {
        const offsets = units.map((u) => ((u.x - c.x) * -dy + (u.y - c.y) * dx) / len);
        return Math.max(...offsets) - Math.min(...offsets);
    };
    if (track.startSpread === null) track.startSpread = spread();
    if (track.spreadAtMidway === null && c.x >= (track.startCentroid.x + gap.x) / 2) {
        track.spreadAtMidway = spread();
    }
    for (const u of units) {
        if (track.crossed.has(u.id) || u.x < (PACK_WALL_COL + 1) * CELL) continue;
        track.crossed.add(u.id);
    }
    for (const u of units) {
        const { col, row } = cellOf(u);
        if (col === PACK_WALL_COL) track.gapRows.add(row);
    }
    return track;
}

function packReport(engine: GameEngine): string {
    const track = trackPack(engine);
    const player = engine.getLocalPlayerUnit();
    if (!track || !player) return 'no track';
    const tracks = trackMotion(engine, PACK_IDS, () => player, 3 * CELL);
    const arrived = PACK_IDS.filter((id) => tracks.get(id)?.arrived).length;
    const inRock = PACK_IDS.map((id) => tracks.get(id)?.inRock).find((r) => r);
    return `startSpread=${track.startSpread === null ? 'n/a' : fmt(track.startSpread)} spreadAtMidway=${track.spreadAtMidway === null ? 'n/a' : fmt(track.spreadAtMidway)} (need ${PACK_MIN_SPREAD}) `
        + `crossedGap=${track.crossed.size}/${PACK_SIZE} gapRowsUsed=[${[...track.gapRows].sort().join(',')}] `
        + `arrived=${arrived}/${PACK_SIZE} inRock=${inRock ? `(${inRock.col},${inRock.row})@${inRock.tick}` : 'no'} tick=${engine.gameTick}`;
}

/**
 * Twelve enemies start bunched in a corner of open ground and chase the player through a
 * two-cell gap in a wall. Crossing the open ground they keep a broad front (crowd spacing, cell
 * capacity and per-unit routes) instead of collapsing into single file; at the wall they funnel
 * through both cells of the gap, sliding past each other, without anyone clipping into rock.
 */
export const movePackFanAndFunnelScenario: ScenarioDefinition = {
    id: 'move_pack_fan_and_funnel',
    title: 'Pack of 12: keeps a broad front in the open, funnels through a gap',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 25000,

    buildEngine() {
        const engine = buildEngine(28, 14);
        const tm = engine.terrainManager!;
        setRock(tm, cellsInRect(PACK_WALL_COL, PACK_WALL_COL, 0, 13).filter(([, row]) => !PACK_GAP_ROWS.includes(row)));

        spawnIdlePlayer(engine, 24, 7);
        // Three per cell (swarmling capacity) in a 2x2 block of cells.
        const cells: [number, number][] = [[2, 2], [3, 2], [2, 3], [3, 3]];
        PACK_IDS.forEach((id, i) => {
            const [col, row] = cells[Math.floor(i / 3)]!;
            const k = i % 3;
            spawnChaser(engine, id, col * CELL + 8 + k * 12, row * CELL + 10 + k * 10, 90, (i + 0.5) / PACK_SIZE);
        });
        packTracks.set(engine, { startCentroid: null, startSpread: null, spreadAtMidway: null, gapRows: new Set(), crossed: new Set() });
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackPack(engine);
        const player = engine.getLocalPlayerUnit();
        if (!track || !player) return false;
        const tracks = trackMotion(engine, PACK_IDS, () => player, 3 * CELL);
        const allArrived = PACK_IDS.every((id) => tracks.get(id)?.arrived);
        const noRock = PACK_IDS.every((id) => !tracks.get(id)?.inRock);
        return allArrived && noRock
            && track.spreadAtMidway !== null && track.spreadAtMidway >= PACK_MIN_SPREAD
            && track.crossed.size === PACK_SIZE
            && PACK_GAP_ROWS.every((row) => track.gapRows.has(row));
    },

    failureMessage: packReport,
    describeState: packReport,
};

// ─── 3. Clear line of sight: charge straight in ─────────────────────────────

const CHARGE_STARTS: [number, number][] = [[2, 2], [21, 3], [2, 13], [22, 14], [9, 1], [15, 15]];
const CHARGE_IDS = CHARGE_STARTS.map((_, i) => `charge_${i}`);
const CHARGE_PLAYER = { col: 12, row: 8 };
/**
 * Rock outcrops in the gaps between the charge lines (every cell at least ~3.7 cells from any
 * line), to show that obstacles off a unit's line do not bend its route.
 */
const CHARGE_DECOR_ROCKS: [number, number][] = [
    [2, 7], [2, 8], [3, 8],
    [21, 8], [22, 8], [21, 9],
    [14, 1], [15, 1], [14, 2],
    [9, 14], [10, 14], [9, 15],
];
const CHARGE_MAX_DEVIATION = 0.5 * CELL;

interface ChargeTrack { multiWaypoint: Set<string> }
const chargeTracks = new WeakMap<GameEngine, ChargeTrack>();

function trackCharge(engine: GameEngine): { charge: ChargeTrack; motion: Map<string, MotionTrack> } | null {
    const charge = chargeTracks.get(engine);
    const player = engine.getLocalPlayerUnit();
    if (!charge || !player) return null;
    const motion = trackMotion(engine, CHARGE_IDS, () => player, 3 * CELL);
    for (const id of CHARGE_IDS) {
        const u = engine.getUnit(id);
        if (!u || motion.get(id)?.arrived) continue;
        if (u.movement && u.movement.path.length > 1) charge.multiWaypoint.add(id);
    }
    return { charge, motion };
}

function chargeReport(engine: GameEngine): string {
    const t = trackCharge(engine);
    if (!t) return 'no track';
    return CHARGE_IDS.map((id) => {
        const m = t.motion.get(id);
        return `${id}: arrived=${m?.arrived} maxDev=${m ? fmt(m.maxDeviation) : '?'} `
            + `multiWaypoint=${t.charge.multiWaypoint.has(id)}`;
    }).join(' | ') + ` (maxDev limit ${CHARGE_MAX_DEVIATION}) tick=${engine.gameTick}`;
}

/**
 * Six enemies around the player, none on a grid axis or pure diagonal, each with a clear line to
 * the player. Every one walks a straight line at the player: its path is never more than the
 * single target waypoint, and it never strays more than half a cell from the start→player line.
 */
export const moveDirectLineChargeScenario: ScenarioDefinition = {
    id: 'move_direct_line_charge',
    title: 'Clear line of sight: every enemy charges in a straight line',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 12000,

    buildEngine() {
        const engine = buildEngine(24, 17);
        setRock(engine.terrainManager!, CHARGE_DECOR_ROCKS);
        spawnIdlePlayer(engine, CHARGE_PLAYER.col, CHARGE_PLAYER.row);
        CHARGE_STARTS.forEach(([col, row], i) => {
            const { x, y } = centre(col, row);
            spawnChaser(engine, CHARGE_IDS[i]!, x, y, 90);
        });
        chargeTracks.set(engine, { multiWaypoint: new Set() });
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const t = trackCharge(engine);
        if (!t) return false;
        return CHARGE_IDS.every((id) => {
            const m = t.motion.get(id);
            return !!m && m.arrived && m.maxDeviation < CHARGE_MAX_DEVIATION && !t.charge.multiWaypoint.has(id);
        });
    },

    failureMessage: chargeReport,
    describeState: chargeReport,
};

// ─── 4. Player orders around created rocks ──────────────────────────────────

/** Created (Earth-style) rock, i.e. the floor layer, not bedrock. */
function createRocks(engine: GameEngine, cells: [number, number][]): void {
    const tm = engine.terrainManager!;
    for (const [col, row] of cells) tm.createOrMarkRock(col, row);
}

interface PlayerOrderTrack {
    initialPathLength: number;
    replanned: boolean;
    passedWaypoint: boolean;
    destGoals: Set<string>;
}
const playerOrderTracks = new WeakMap<GameEngine, PlayerOrderTrack>();

function playerMotion(engine: GameEngine, goal: { x: number; y: number }): MotionTrack | undefined {
    const player = engine.getLocalPlayerUnit();
    if (!player) return undefined;
    // Arrival within a few px: players aim at the exact cell centre or pixel.
    return trackMotion(engine, [player.id], () => goal, 4).get(player.id);
}

// 4a. Click-to-move.
const CLICK_START = { col: 3, row: 3 };
const CLICK_DEST = { col: 18, row: 3 };
const CLICK_DROP_TICK = 75;

function clickReport(engine: GameEngine): string {
    const t = playerOrderTracks.get(engine);
    const m = playerMotion(engine, centre(CLICK_DEST.col, CLICK_DEST.row));
    const player = engine.getLocalPlayerUnit();
    return `orderPathWaypoints=${t?.initialPathLength} replannedAfterDrop=${t?.replanned} `
        + `arrived=${m?.arrived} inRock=${m?.inRock ? `(${m.inRock.col},${m.inRock.row})` : 'no'} `
        + `cell=${player ? JSON.stringify(cellOf(player)) : '?'} movement=${player?.movement ? 'yes' : 'none'} tick=${engine.gameTick}`;
}

/**
 * The player click-moves across a field split by a wall of created rock with a gap at the bottom.
 * The order path (built exactly as the UI preview builds it) bends through the gap rather than
 * through the created rock. Mid-walk, more rock is created across the rest of the route; the
 * order is re-planned round it and the player still arrives, never stepping into rock.
 */
export const movePlayerClickAroundCreatedRockScenario: ScenarioDefinition = {
    id: 'move_player_click_around_created_rock',
    title: 'Player click-to-move routes round created rock, even rock dropped mid-walk',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildEngine(22, 12);
        spawnOrderedPlayer(engine, CLICK_START.col, CLICK_START.row);
        createRocks(engine, cellsInRect(10, 10, 0, 8));
        playerOrderTracks.set(engine, { initialPathLength: 0, replanned: false, passedWaypoint: false, destGoals: new Set() });
        return engine;
    },

    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const movePath = buildPlayerMovePathThroughWaypoints(tm, CLICK_START.col, CLICK_START.row, [CLICK_DEST]) ?? [];
        playerOrderTracks.get(engine)!.initialPathLength = movePath.length;
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath }];
    },

    assertPass(engine) {
        const t = playerOrderTracks.get(engine);
        const player = engine.getLocalPlayerUnit();
        if (!t || !player) return false;
        if (engine.gameTick === CLICK_DROP_TICK) {
            // Wall across the remaining route, open only along the top rows.
            createRocks(engine, cellsInRect(14, 14, 2, 11));
        }
        if (engine.gameTick > CLICK_DROP_TICK && player.movement && player.movement.navEpoch === engine.terrainManager!.navEpoch
            && player.movement.path.some((wp) => wp.row <= 1)) {
            t.replanned = true;
        }
        const m = playerMotion(engine, centre(CLICK_DEST.col, CLICK_DEST.row));
        return t.initialPathLength > 1 && t.replanned && !!m && !m.inRock
            && player.movement === null && cellOf(player).col === CLICK_DEST.col && cellOf(player).row === CLICK_DEST.row;
    },

    failureMessage: clickReport,
    describeState: clickReport,
};

// 4b. Wait + move through the player's own waypoints.
const WAIT_START = { col: 2, row: 6 };
const WAIT_WAYPOINTS = [{ col: 10, row: 1 }, { col: 19, row: 9 }];

function waitReport(engine: GameEngine): string {
    const t = playerOrderTracks.get(engine);
    const player = engine.getLocalPlayerUnit();
    const m = playerMotion(engine, centre(WAIT_WAYPOINTS[1]!.col, WAIT_WAYPOINTS[1]!.row));
    return `passedPlayerWaypoint=${t?.passedWaypoint} arrived=${m?.arrived} waitLockout=${player?.waitMaxEndTime !== null} `
        + `inRock=${m?.inRock ? `(${m.inRock.col},${m.inRock.row})` : 'no'} cell=${player ? JSON.stringify(cellOf(player)) : '?'} tick=${engine.gameTick}`;
}

/**
 * A "wait until arrived" order that moves through a waypoint the player placed above a block of
 * created rock, then on to a destination on the far side. The player's own waypoint is honoured
 * (never trimmed away as a shortcut), the walk steers round the created rock, and the wait ends
 * when the player arrives.
 */
export const movePlayerWaitMoveWaypointsScenario: ScenarioDefinition = {
    id: 'move_player_wait_move_waypoints',
    title: 'Player wait+move keeps its waypoints and steers round created rock',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildEngine(22, 12);
        spawnOrderedPlayer(engine, WAIT_START.col, WAIT_START.row);
        createRocks(engine, cellsInRect(8, 12, 4, 8));
        playerOrderTracks.set(engine, { initialPathLength: 0, replanned: false, passedWaypoint: false, destGoals: new Set() });
        return engine;
    },

    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const movePath = buildPlayerMovePathThroughWaypoints(tm, WAIT_START.col, WAIT_START.row, WAIT_WAYPOINTS) ?? [];
        playerOrderTracks.get(engine)!.initialPathLength = movePath.length;
        return [{
            unitId: engine.getLocalPlayerUnit()!.id,
            abilityId: 'wait',
            abilityMode: WAIT_ABILITY_MODE_FAR,
            targets: [],
            movePath,
        }];
    },

    assertPass(engine) {
        const t = playerOrderTracks.get(engine);
        const player = engine.getLocalPlayerUnit();
        if (!t || !player) return false;
        const wp = centre(WAIT_WAYPOINTS[0]!.col, WAIT_WAYPOINTS[0]!.row);
        if (Math.hypot(player.x - wp.x, player.y - wp.y) <= 0.6 * CELL) t.passedWaypoint = true;
        const dest = WAIT_WAYPOINTS[1]!;
        const m = playerMotion(engine, centre(dest.col, dest.row));
        return t.passedWaypoint && !!m && !m.inRock && player.movement === null
            && cellOf(player).col === dest.col && cellOf(player).row === dest.row
            && player.waitMaxEndTime === null;
    },

    failureMessage: waitReport,
    describeState: waitReport,
};

// 4c. Pursue a moving unit.
const PURSUE_TARGET_ID = 'pursue_target';
const PURSUE_TARGET_LEGS: { atTick: number; col: number; row: number }[] = [
    { atTick: 1, col: 20, row: 9 },
    { atTick: 150, col: 17, row: 1 },
];

function pursueStopDist(player: Unit, target: Unit): number {
    return player.radius + target.radius + MIN_FOLLOW_RADIUS;
}

function pursueReport(engine: GameEngine): string {
    const t = playerOrderTracks.get(engine);
    const player = engine.getLocalPlayerUnit();
    const target = engine.getUnit(PURSUE_TARGET_ID);
    const m = player && target ? playerMotion(engine, target) : undefined;
    const dist = player && target ? Math.hypot(player.x - target.x, player.y - target.y) : NaN;
    return `goalCellsFollowed=${t?.destGoals.size} dist=${fmt(dist)} (stop ${player && target ? fmt(pursueStopDist(player, target)) : '?'}) `
        + `targetWalking=${target?.walkIntent !== null} playerMovement=${player?.movement ? 'yes' : 'none'} `
        + `inRock=${m?.inRock ? `(${m.inRock.col},${m.inRock.row})` : 'no'} tick=${engine.gameTick}`;
}

/**
 * The player orders a pursuit of a unit on the far side of a created-rock wall. The quarry keeps
 * moving (two legs); the player's goal follows it and the route bends round the wall's open end
 * each time. The player ends up stopped at touching distance from the quarry, never in rock.
 */
export const movePlayerPursueMovingUnitScenario: ScenarioDefinition = {
    id: 'move_player_pursue_moving_unit',
    title: 'Player pursuit follows a moving unit round created rock',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 20000,

    buildEngine() {
        const engine = buildEngine(24, 12);
        spawnOrderedPlayer(engine, 3, 8);
        createRocks(engine, cellsInRect(11, 11, 3, 11));
        spawnWalker(engine, PURSUE_TARGET_ID, 15, 8, 45);
        playerOrderTracks.set(engine, { initialPathLength: 0, replanned: false, passedWaypoint: false, destGoals: new Set() });
        return engine;
    },

    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const target = engine.getUnit(PURSUE_TARGET_ID)!;
        const to = cellOf(target);
        const movePath = buildPlayerMovePathThroughWaypoints(tm, 3, 8, [to]) ?? [];
        return [{
            unitId: engine.getLocalPlayerUnit()!.id,
            abilityId: MOVE_ONLY_ABILITY_ID,
            targets: [],
            movePath,
            moveTargetUnitId: PURSUE_TARGET_ID,
        }];
    },

    assertPass(engine) {
        const t = playerOrderTracks.get(engine);
        const player = engine.getLocalPlayerUnit();
        const target = engine.getUnit(PURSUE_TARGET_ID);
        if (!t || !player || !target) return false;
        for (const leg of PURSUE_TARGET_LEGS) {
            if (engine.gameTick === leg.atTick) target.setWalkGoal({ kind: 'cell', col: leg.col, row: leg.row });
        }
        if (player.walkIntent?.targetUnitId === PURSUE_TARGET_ID) {
            t.destGoals.add(`${player.walkIntent.dest.col},${player.walkIntent.dest.row}`);
        }
        const m = playerMotion(engine, target);
        const lastLeg = PURSUE_TARGET_LEGS[PURSUE_TARGET_LEGS.length - 1]!;
        const targetDone = engine.gameTick > lastLeg.atTick && target.walkIntent === null;
        const dist = Math.hypot(player.x - target.x, player.y - target.y);
        return targetDone && t.destGoals.size >= 3 && !!m && !m.inRock
            && player.movement === null && dist <= pursueStopDist(player, target) + 2;
    },

    failureMessage: pursueReport,
    describeState: pursueReport,
};

// ─── 5. Terrain changes mid-chase: reroute without stalling ─────────────────

const REROUTE_IDS = Array.from({ length: 6 }, (_, i) => `reroute_${i}`);
const REROUTE_WALL_TICK = 45;
const REROUTE_CLEAR_TICK = 170;
const REROUTE_WALL: [number, number][] = cellsInRect(12, 12, 0, 8);
/** Longest a chaser may stand still (with somewhere to go) before it counts as a stall. */
const REROUTE_MAX_STALL_TICKS = 15;

interface RerouteTrack { detoured: boolean; straightAfterClear: Set<string> }
const rerouteTracks = new WeakMap<GameEngine, RerouteTrack>();

function trackReroute(engine: GameEngine): { r: RerouteTrack; motion: Map<string, MotionTrack> } | null {
    const r = rerouteTracks.get(engine);
    const player = engine.getLocalPlayerUnit();
    if (!r || !player) return null;
    const tm = engine.terrainManager!;
    if (engine.gameTick === REROUTE_WALL_TICK) createRocks(engine, REROUTE_WALL);
    if (engine.gameTick === REROUTE_CLEAR_TICK) {
        for (const [col, row] of REROUTE_WALL) tm.damageRock(col, row, 10000);
    }
    const motion = trackMotion(engine, REROUTE_IDS, () => player, 3 * CELL);
    for (const id of REROUTE_IDS) {
        const u = engine.getUnit(id);
        if (!u?.movement) continue;
        if (engine.gameTick > REROUTE_WALL_TICK && engine.gameTick < REROUTE_CLEAR_TICK && u.movement.path.length > 1) r.detoured = true;
        if (engine.gameTick > REROUTE_CLEAR_TICK && u.x < 12 * CELL && u.movement.path.length === 1) r.straightAfterClear.add(id);
    }
    return { r, motion };
}

function rerouteReport(engine: GameEngine): string {
    const t = trackReroute(engine);
    if (!t) return 'no track';
    const arrived = REROUTE_IDS.filter((id) => t.motion.get(id)?.arrived).length;
    const maxStall = Math.max(0, ...REROUTE_IDS.map((id) => t.motion.get(id)?.maxStall ?? 0));
    const inRock = REROUTE_IDS.map((id) => t.motion.get(id)?.inRock).find((x) => x);
    return `detoured=${t.r.detoured} straightAgainAfterClear=${t.r.straightAfterClear.size} arrived=${arrived}/${REROUTE_IDS.length} `
        + `maxStallTicks=${maxStall} (limit ${REROUTE_MAX_STALL_TICKS}) inRock=${inRock ? `(${inRock.col},${inRock.row})` : 'no'} tick=${engine.gameTick}`;
}

/**
 * Six enemies charge across open ground. Shortly after they set off, a wall of rock is created
 * across their route (open only at the bottom): they bend round it at once. Before they get
 * there it is destroyed again, and they straighten back onto the direct line. Nobody ever stands
 * still for more than a quarter of a second while it has somewhere to go.
 */
export const moveRerouteWithoutStallsScenario: ScenarioDefinition = {
    id: 'move_reroute_without_stalls',
    title: 'Rock created then destroyed mid-chase: instant reroute, no stalls',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildEngine(26, 12);
        spawnIdlePlayer(engine, 23, 4);
        REROUTE_IDS.forEach((id, i) => {
            const { x, y } = centre(2 + (i % 2), 2 + Math.floor(i / 2) * 2);
            spawnChaser(engine, id, x, y, 70, (i + 0.5) / REROUTE_IDS.length);
        });
        rerouteTracks.set(engine, { detoured: false, straightAfterClear: new Set() });
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const t = trackReroute(engine);
        if (!t) return false;
        const allArrived = REROUTE_IDS.every((id) => t.motion.get(id)?.arrived);
        const noRock = REROUTE_IDS.every((id) => !t.motion.get(id)?.inRock);
        const noStall = REROUTE_IDS.every((id) => (t.motion.get(id)?.maxStall ?? 0) <= REROUTE_MAX_STALL_TICKS);
        return allArrived && noRock && noStall && t.r.detoured && t.r.straightAfterClear.size > 0;
    },

    failureMessage: rerouteReport,
    describeState: rerouteReport,
};

/** Every showcase scenario, in sidebar order. */
export const MOVEMENT_SHOWCASE_SCENARIOS: ScenarioDefinition[] = [
    moveDirectLineChargeScenario,
    moveRockCorridorRouteScenario,
    movePackFanAndFunnelScenario,
    moveRerouteWithoutStallsScenario,
    movePlayerClickAroundCreatedRockScenario,
    movePlayerWaitMoveWaypointsScenario,
    movePlayerPursueMovingUnitScenario,
];
