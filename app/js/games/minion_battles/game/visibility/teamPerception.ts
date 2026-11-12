/**
 * Team perception: which tiles a team can see and how well it perceives every unit
 * (seen > glimpsed > heard > felt > hidden).
 *
 * Presentation-only. It is derived from simulation state every tick and never serialized, and
 * simulation code must never read it (AI keeps its own `perceptionRange`), so it cannot desync.
 *
 * - {@link computeTeamPerception}: pure function of state.
 * - {@link getTeamPerception}: per-engine cache, recomputed when the tick, terrain epoch or team changes.
 * - {@link getUnitDetection}: the single consumer entry point (renderers, tutorials). Honours the debug
 *   "dark overlay off" and "Reveal all units" settings.
 *
 * Sense rules (priority, walls, darkness) come from `SENSE_DEFS`; each sense id has one detector below.
 */

import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { DarknessLevel } from '../darknessLevels';
import { areAllies, areEnemies, type TeamId } from '../teams';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { forEachTileOnLine, isTileLineClearPermissive } from '../../terrain/tileLine';
import { PERF_TEAM_PERCEPTION, tickPerformanceTracker } from '../performance/tickPerformanceTracker';
import {
    darknessVisionCost,
    getDarknessPenetration,
    getUnitSenses,
    SENSE_DEFS,
    SENSE_IDS_BY_PRIORITY,
    type Detection,
    type SenseId,
    type SenseProfile,
    type SensingUnit,
} from './senses';

/** The unit fields perception reads (structural, so tests can pass plain objects). */
export interface PerceivedUnit extends SensingUnit {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly teamId: TeamId;
    isAlive(): boolean;
}

/** The engine fields perception reads. `GameEngine` satisfies this. */
export interface PerceptionEngine {
    readonly units: readonly PerceivedUnit[];
    readonly terrainManager: Pick<TerrainManager, 'grid' | 'blocksVisionAt' | 'navEpoch'> | null;
    readonly lightLevelEnabled: boolean;
    readonly gameTick: number;
    getLightAt(col: number, row: number): number | null;
}

/** What one team perceives. Derived, never serialized. */
export interface TeamPerception {
    readonly teamId: TeamId;
    /** Grid size `visibleTiles` is laid out on (0 × 0 without terrain). */
    readonly width: number;
    readonly height: number;
    /** Row-major, 1 = inside the team's vision. All 1 when the light system is off. */
    readonly visibleTiles: Uint8Array;
    /** Detection per unit id (non-enemies are always `'seen'`). */
    readonly detections: ReadonlyMap<string, Detection>;
    /** Bumped by {@link getTeamPerception} on every recompute; 0 from {@link computeTeamPerception}. */
    readonly revision: number;
}

/** True when the unit body is drawn: `'seen'` or `'glimpsed'`. */
export function isDetectionVisible(detection: Detection): boolean {
    return detection === 'seen' || detection === 'glimpsed';
}

const COST_EPSILON = 1e-9;

/** One viewing unit with its resolved senses. */
interface Viewer {
    col: number;
    row: number;
    senses: SenseProfile;
}

/** Shared per-compute state: the grid, lazily cached per-tile darkness costs and the vision mask. */
interface PerceptionContext {
    width: number;
    height: number;
    cellSize: number;
    blocks: (col: number, row: number) => boolean;
    /** Lazily filled darkness cost per tile (NaN = not read yet). */
    costs: Float32Array;
    getLightAt: (col: number, row: number) => number | null;
    visibleTiles: Uint8Array;
    viewers: Viewer[];
}

function tileCost(ctx: PerceptionContext, col: number, row: number): number {
    if (col < 0 || row < 0 || col >= ctx.width || row >= ctx.height) return 1;
    const i = row * ctx.width + col;
    let c = ctx.costs[i]!;
    if (Number.isNaN(c)) {
        const light = ctx.getLightAt(col, row);
        c = light === null ? 1 : darknessVisionCost(light);
        ctx.costs[i] = c;
    }
    return c;
}

function isLit(ctx: PerceptionContext, col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= ctx.width || row >= ctx.height) return false;
    const light = ctx.getLightAt(col, row);
    return light !== null && light > DarknessLevel.FULL_DARKNESS;
}

function withinRange(dc: number, dr: number, range: number): boolean {
    return dc * dc + dr * dr <= range * range;
}

/**
 * Mark every tile the viewer sees: within `vision.range`, a forgiving sight line clear of `blocksVision`
 * (`isTileLineClearPermissive`, endpoints exempt) when vision is wall-blocked, and darkness cost along the
 * centre line (first tile after the viewer through the target, inclusive) within the darkness budget when
 * vision is darkness-limited.
 */
function markViewerVision(ctx: PerceptionContext, viewer: Viewer): void {
    const vision = viewer.senses.vision;
    if (!vision || vision.range < 0) return;
    const def = SENSE_DEFS.vision;
    const budget = def.affectedByDarkness ? getDarknessPenetration(viewer.senses) : Infinity;
    const { col: vc, row: vr } = viewer;
    const r = Math.floor(vision.range);
    const minC = Math.max(0, vc - r);
    const maxC = Math.min(ctx.width - 1, vc + r);
    const minR = Math.max(0, vr - r);
    const maxR = Math.min(ctx.height - 1, vr + r);
    for (let tr = minR; tr <= maxR; tr++) {
        for (let tc = minC; tc <= maxC; tc++) {
            const idx = tr * ctx.width + tc;
            if (ctx.visibleTiles[idx]) continue;
            if (!withinRange(tc - vc, tr - vr, vision.range)) continue;
            // Darkness is paid along the centre line; walls use the forgiving sight line, so a pillar
            // that only clips the centre line does not hide the tile.
            let cost = 0;
            let wallOnCentreLine = false;
            const affordable = forEachTileOnLine(vc, vr, tc, tr, (c, rw) => {
                if (c === vc && rw === vr) return true;
                const isTarget = c === tc && rw === tr;
                if (def.blockedByWalls && !isTarget && ctx.blocks(c, rw)) wallOnCentreLine = true;
                if (budget !== Infinity) {
                    cost += tileCost(ctx, c, rw);
                    if (cost > budget + COST_EPSILON) return false;
                }
                return true;
            });
            if (!affordable) continue;
            if (wallOnCentreLine && !isTileLineClearPermissive(vc, vr, tc, tr, ctx.blocks)) continue;
            ctx.visibleTiles[idx] = 1;
        }
    }
}

type SenseDetector = (ctx: PerceptionContext, col: number, row: number) => Detection | null;

/**
 * Vision: `'seen'` when the tile is in the team's vision mask; otherwise `'glimpsed'` when the tile is lit
 * and some viewer with `glimpseLit` has a line to it (no range cap).
 */
const detectByVision: SenseDetector = (ctx, col, row) => {
    if (col >= 0 && row >= 0 && col < ctx.width && row < ctx.height && ctx.visibleTiles[row * ctx.width + col]) {
        return SENSE_DEFS.vision.detection;
    }
    if (!isLit(ctx, col, row)) return null;
    for (const v of ctx.viewers) {
        if (!v.senses.vision?.glimpseLit) continue;
        if (!SENSE_DEFS.vision.blockedByWalls || isTileLineClearPermissive(v.col, v.row, col, row, ctx.blocks)) {
            return 'glimpsed';
        }
    }
    return null;
};

/**
 * A range-only sense (hearing, tremorsense): any viewer whose range reaches the tile (Euclidean, tile
 * centres), with a clear line when the sense's def is wall-blocked.
 */
function rangedDetector(senseId: SenseId): SenseDetector {
    const def = SENSE_DEFS[senseId];
    return (ctx, col, row) => {
        for (const v of ctx.viewers) {
            const range = v.senses[senseId]?.range;
            if (range === undefined || !withinRange(col - v.col, row - v.row, range)) continue;
            if (def.blockedByWalls && !isTileLineClearPermissive(v.col, v.row, col, row, ctx.blocks)) continue;
            return def.detection;
        }
        return null;
    };
}

/** One detector per sense. A new sense is a `SENSE_DEFS` entry plus a detector here (usually `rangedDetector`). */
const SENSE_DETECTORS: Readonly<Record<SenseId, SenseDetector>> = {
    vision: detectByVision,
    hearing: rangedDetector('hearing'),
    tremorsense: rangedDetector('tremorsense'),
};

function unitTile(ctx: PerceptionContext, unit: PerceivedUnit): { col: number; row: number } {
    return { col: Math.floor(unit.x / ctx.cellSize), row: Math.floor(unit.y / ctx.cellSize) };
}

/** Detection for one unit against a built context. Senses are tried strongest first (`SENSE_IDS_BY_PRIORITY`). */
function detectUnit(ctx: PerceptionContext, teamId: TeamId, unit: PerceivedUnit): Detection {
    if (!areEnemies(teamId, unit.teamId)) return 'seen';
    const { col, row } = unitTile(ctx, unit);
    for (const senseId of SENSE_IDS_BY_PRIORITY) {
        const d = SENSE_DETECTORS[senseId](ctx, col, row);
        if (d) return d;
    }
    return 'hidden';
}

interface PerceptionBuild {
    perception: TeamPerception;
    /** Null when everything is seen (light off or no terrain). */
    ctx: PerceptionContext | null;
}

function buildPerception(engine: PerceptionEngine, teamId: TeamId): PerceptionBuild {
    const grid = engine.terrainManager?.grid ?? null;
    const width = grid?.width ?? 0;
    const height = grid?.height ?? 0;
    const detections = new Map<string, Detection>();

    if (!engine.lightLevelEnabled || !grid || !engine.terrainManager) {
        for (const u of engine.units) detections.set(u.id, 'seen');
        return {
            perception: { teamId, width, height, visibleTiles: new Uint8Array(width * height).fill(1), detections, revision: 0 },
            ctx: null,
        };
    }

    const terrain = engine.terrainManager;
    const ctx: PerceptionContext = {
        width,
        height,
        cellSize: grid.cellSize,
        blocks: (c, r) => terrain.blocksVisionAt(c, r),
        costs: new Float32Array(width * height).fill(NaN),
        getLightAt: (c, r) => engine.getLightAt(c, r),
        visibleTiles: new Uint8Array(width * height),
        viewers: [],
    };
    for (const u of engine.units) {
        if (!u.isAlive() || !areAllies(teamId, u.teamId)) continue;
        const { col, row } = unitTile(ctx, u);
        ctx.viewers.push({ col, row, senses: getUnitSenses(u) });
    }
    for (const v of ctx.viewers) markViewerVision(ctx, v);
    for (const u of engine.units) detections.set(u.id, detectUnit(ctx, teamId, u));

    return { perception: { teamId, width, height, visibleTiles: ctx.visibleTiles, detections, revision: 0 }, ctx };
}

/**
 * Pure: what `teamId` perceives in the current state. Viewers are the team's living allied units.
 * With the light system off (or no terrain), every unit is `'seen'` and every tile visible.
 */
export function computeTeamPerception(engine: PerceptionEngine, teamId: TeamId): TeamPerception {
    return buildPerception(engine, teamId).perception;
}

interface PerceptionCacheEntry {
    teamId: TeamId;
    gameTick: number;
    navEpoch: number;
    lightLevelEnabled: boolean;
    terrainManager: PerceptionEngine['terrainManager'];
    units: readonly PerceivedUnit[];
    unitCount: number;
    revision: number;
    build: PerceptionBuild;
}

/** Per-engine cache (never module-level state keyed by anything but the engine). */
const perceptionCache = new WeakMap<object, PerceptionCacheEntry>();

function isCacheValid(entry: PerceptionCacheEntry, engine: PerceptionEngine, teamId: TeamId): boolean {
    return (
        entry.teamId === teamId &&
        entry.gameTick === engine.gameTick &&
        entry.navEpoch === (engine.terrainManager?.navEpoch ?? -1) &&
        entry.lightLevelEnabled === engine.lightLevelEnabled &&
        entry.terrainManager === engine.terrainManager &&
        entry.units === engine.units &&
        entry.unitCount === engine.units.length
    );
}

function getCacheEntry(engine: PerceptionEngine, teamId: TeamId): PerceptionCacheEntry {
    const prev = perceptionCache.get(engine);
    if (prev && isCacheValid(prev, engine, teamId)) return prev;
    const build = tickPerformanceTracker.measure([PERF_TEAM_PERCEPTION], () => buildPerception(engine, teamId));
    const revision = (prev?.revision ?? 0) + 1;
    const entry: PerceptionCacheEntry = {
        teamId,
        gameTick: engine.gameTick,
        navEpoch: engine.terrainManager?.navEpoch ?? -1,
        lightLevelEnabled: engine.lightLevelEnabled,
        terrainManager: engine.terrainManager,
        units: engine.units,
        unitCount: engine.units.length,
        revision,
        build: { ...build, perception: { ...build.perception, revision } },
    };
    perceptionCache.set(engine, entry);
    return entry;
}

/**
 * Cached {@link computeTeamPerception} for `engine`. Recomputes when the game tick, terrain `navEpoch`,
 * team, light toggle or unit list changes, and bumps `revision` each time.
 */
export function getTeamPerception(engine: PerceptionEngine, teamId: TeamId): TeamPerception {
    return getCacheEntry(engine, teamId).build.perception;
}

/** Debug settings that make every unit `'seen'`: dark overlay off, or "Reveal all units". */
function isPerceptionBypassed(): boolean {
    return !debugSettingsSnapshot.darkOverlayEnabled || debugSettingsSnapshot.revealAllUnits === true;
}

/**
 * True when perception limits what is drawn: the mission's light system is on and no debug bypass is set.
 * Renderers use it to gate darkness-only styling (e.g. translucent enemies in the dark), which a `'seen'`
 * detection alone cannot tell apart from "everything seen because perception is off".
 */
export function isPerceptionActive(engine: Pick<PerceptionEngine, 'lightLevelEnabled'>): boolean {
    return engine.lightLevelEnabled && !isPerceptionBypassed();
}

/**
 * The single consumer entry point: how `teamId` (usually the local team) perceives `unit`.
 * Renderers and UI ask this instead of re-deriving visibility from light. A unit not in the
 * engine's unit list (e.g. a preview ghost) is detected against the same cached viewers.
 */
export function getUnitDetection(engine: PerceptionEngine, teamId: TeamId, unit: PerceivedUnit): Detection {
    if (isPerceptionBypassed()) return 'seen';
    const { build } = getCacheEntry(engine, teamId);
    const known = build.perception.detections.get(unit.id);
    if (known) return known;
    return build.ctx ? detectUnit(build.ctx, teamId, unit) : 'seen';
}
