/**
 * Growing and dismissing a Garden Heart tree. `growGardenTree` turns a phase's layout table (`gardenTreeLayouts.ts`)
 * into linked, tethered units around the Heart; `dismissGardenTree` kills a whole tree so its Stems become Briar.
 * The mission wires them to the phase burrow (`gardenDismissTree` at the sink stage, `gardenGrowTree` at the rise
 * stage; see `gardenHeartRegistrations.ts`), but both are plain functions a mission or test can call directly.
 *
 * Nothing here is a Garden Heart special case in the engine: it uses node trees (`nodeTreeSpawn.ts`), tethers and
 * spawning like any boss with sub-units would.
 */

import type { Unit } from '../units/Unit';
import type { TeamId } from '../teams';
import { getEnemyHealthMultiplier } from '../../constants/enemyConstants';
import { getDefaultHp, getUnitDefEntry } from '../units/unit_defs/unitDef';
import { spawnNodeChild } from '../units/components/nodeTreeSpawn';
import { getNodeChildIds, getNodeLayoutKey, markNodeDismissed, peekNodeTreeState, setNodeLayoutKey } from '../units/components/nodeTree';
import type { SpawnDefinition } from '../units/spawning/spawnDefinition';
import type { SpawnUnitContext } from '../units/spawning/spawnUnit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { GARDEN_GROWTH_PHASE_VARIABLE, STEM_LEASH_PX } from '../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { setBattleVariable } from '../battleVariables';
import type { EngineContext } from '../EngineContext';
import { startBurrowEmerge } from '../units/components/burrowEmergeHooks';
import { gardenTreeLayout, type GardenNodeSpec } from './gardenTreeLayouts';

/** What growing needs from the engine: spawning, the unit list, and the player count enemy health scales by. */
export type GardenGrowContext = SpawnUnitContext & { readonly enemyScalingPlayerCount: number };

/** Search radius (in tiles) around the wanted spot for passable ground. */
const NUDGE_RADIUS_TILES = 3;

/** The wanted point if it is passable ground, else the nearest passable tile centre within a few tiles, else the wanted point. */
export function nearestPassablePoint(
    terrain: { isPassable(x: number, y: number): boolean } | null,
    x: number,
    y: number,
): { x: number; y: number } {
    if (!terrain || terrain.isPassable(x, y)) return { x, y };
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    const col0 = Math.floor(x / CELL_SIZE);
    const row0 = Math.floor(y / CELL_SIZE);
    for (let dr = -NUDGE_RADIUS_TILES; dr <= NUDGE_RADIUS_TILES; dr++) {
        for (let dc = -NUDGE_RADIUS_TILES; dc <= NUDGE_RADIUS_TILES; dc++) {
            const cx = (col0 + dc + 0.5) * CELL_SIZE;
            const cy = (row0 + dr + 0.5) * CELL_SIZE;
            if (!terrain.isPassable(cx, cy)) continue;
            const d = Math.hypot(cx - x, cy - y);
            if (d < bestDist) {
                bestDist = d;
                best = { x: cx, y: cy };
            }
        }
    }
    return best ?? { x, y };
}

/** Where `spec` wants to stand, given its parent's position (before nudging to passable ground). */
export function nodeWantedPoint(
    parent: { x: number; y: number },
    spec: Pick<GardenNodeSpec, 'angleDeg' | 'distancePx'>,
): { x: number; y: number } {
    const a = (spec.angleDeg * Math.PI) / 180;
    return { x: parent.x + Math.cos(a) * spec.distancePx, y: parent.y + Math.sin(a) * spec.distancePx };
}

/** Spawn definition for one node, built from its kind's base spawn template, health scaled by player count. */
function buildNodeSpawn(
    spec: GardenNodeSpec,
    teamId: TeamId,
    playerCount: number,
    at: { x: number; y: number },
): SpawnDefinition {
    const base = getUnitDefEntry(spec.kind)?.baseSpawn;
    if (!base) throw new Error(`growGardenTree: unit def "${spec.kind}" has no baseSpawn`);
    const baseHp = getDefaultHp(spec.kind);
    const hp = teamId === 'enemy' ? Math.max(1, Math.round(baseHp * getEnemyHealthMultiplier(playerCount))) : baseHp;
    return {
        characterId: base.characterId,
        name: base.name,
        abilities: [...base.abilities],
        aiSettings: base.aiSettings ? { ...base.aiSettings } : null,
        unitTags: base.unitTags ? [...base.unitTags] : undefined,
        unitAITreeId: base.unitAITreeId,
        teamId,
        ownerId: 'ai',
        hp,
        placement: { kind: 'fixedWorld', x: at.x, y: at.y },
    };
}

export interface GrowGardenTreeOptions {
    /** Where the tree grows from. Default: the Heart's own position (it has already surfaced there). */
    at?: { x: number; y: number };
    /**
     * Turn the whole tree so the layout's 0 degrees (its front) points from the Heart at this spot, e.g. the party,
     * so the first node stands between them. Default: the layout as authored.
     */
    faceToward?: { x: number; y: number };
    /**
     * Regrowth: grow only the layout keys that have no living node under the Heart (their living neighbours stay put and
     * parent anything new). The returned map holds only the nodes grown by this call. Does not touch the growth-phase
     * battle variable. A missing node whose parent is also missing waits until the parent is back.
     */
    onlyMissing?: boolean;
    /** Grow at most this many nodes (table order, so parents come before their children). */
    limit?: number;
}

/** Living nodes under `heart` by the layout key they fill. */
function livingNodesByKey(engine: { getUnit(id: string): Unit | undefined }, heart: Unit): Map<string, Unit> {
    const byKey = new Map<string, Unit>();
    for (const unit of gardenTreeDescendants(engine, heart)) {
        const key = getNodeLayoutKey(unit);
        if (key !== null && unit.isAlive()) byKey.set(key, unit);
    }
    return byKey;
}

/** Layout keys of `phase`'s tree that have no living node under `heart`, in table order. */
export function missingGardenNodeKeys(
    engine: { getUnit(id: string): Unit | undefined },
    heart: Unit,
    phase: number,
): string[] {
    const layout = gardenTreeLayout(phase);
    if (!layout) return [];
    const living = livingNodesByKey(engine, heart);
    return layout.filter((spec) => !living.has(spec.key)).map((spec) => spec.key);
}

/** Degrees to add to every layout angle so 0 degrees points from `origin` at `target` (0 when they coincide). */
export function treeFacingTurnDeg(origin: { x: number; y: number }, target: { x: number; y: number } | undefined): number {
    if (!target || (target.x === origin.x && target.y === origin.y)) return 0;
    return (Math.atan2(target.y - origin.y, target.x - origin.x) * 180) / Math.PI;
}

/**
 * Grow the tree for a 1-based `phase` around `heart`: spawn each node in table order, link it under its parent with a
 * Stem tether (`STEM_LEASH_PX`), and return the units by layout key. Does nothing (returns an empty map) for a phase
 * with no layout. The Heart itself is not spawned; it is the root.
 */
export function growGardenTree(
    ctx: GardenGrowContext,
    heart: Unit,
    phase: number,
    options: GrowGardenTreeOptions = {},
): Map<string, Unit> {
    const layout = gardenTreeLayout(phase);
    const grown = new Map<string, Unit>();
    if (!layout) return grown;
    // The fight has moved on: escalating node behaviour (Thorn Fans waves) reads this.
    if (!options.onlyMissing) setBattleVariable(ctx, GARDEN_GROWTH_PHASE_VARIABLE, phase);
    // Every slot with a living node (regrowth) or, for a fresh tree, every node grown so far: parents are looked up here.
    const byKey = options.onlyMissing ? livingNodesByKey({ getUnit: (id) => ctx.units.find((u) => u.id === id) }, heart) : grown;
    const origin = options.at ?? { x: heart.x, y: heart.y };
    // Every angle is absolute, so turning them all by the same amount turns the tree rigidly.
    const turnDeg = treeFacingTurnDeg(origin, options.faceToward);
    for (const spec of layout) {
        if (options.onlyMissing) {
            if (byKey.has(spec.key)) continue;
            if (options.limit !== undefined && grown.size >= options.limit) break;
        }
        const parent = spec.parent === null ? heart : byKey.get(spec.parent);
        if (!parent) {
            if (options.onlyMissing) continue; // its parent is missing too and was not grown (limit): wait for it
            throw new Error(`growGardenTree: node "${spec.key}" names parent "${spec.parent}" that is not earlier in the table`);
        }
        const anchor = spec.parent === null ? origin : { x: parent.x, y: parent.y };
        const wanted = nodeWantedPoint(anchor, { angleDeg: spec.angleDeg + turnDeg, distancePx: spec.distancePx });
        const at = nearestPassablePoint(ctx.terrainManager, wanted.x, wanted.y);
        const unit = spawnNodeChild(ctx, parent, buildNodeSpawn(spec, heart.teamId, ctx.enemyScalingPlayerCount, at), {
            tetherMaxLength: Math.max(STEM_LEASH_PX, Math.hypot(at.x - anchor.x, at.y - anchor.y) + CELL_SIZE),
        });
        if (unit) {
            setNodeLayoutKey(unit, spec.key);
            grown.set(spec.key, unit);
            if (byKey !== grown) byKey.set(spec.key, unit);
        }
    }
    return grown;
}

export interface GardenEmergeOptions {
    /** Tick-time seconds before the first nodes set off (e.g. the rest of the Heart's own rise). */
    delaySeconds: number;
    /** Each node's travel underground and its rise (tick-time seconds). */
    travelSeconds: number;
    riseSeconds: number;
}

/**
 * The tree's entry: every node in `grown` (as returned by `growGardenTree`) goes back underground and burrows out to its
 * spot, from the Heart for nodes on the Heart and from its parent's spot for the rest. A node sets off once its parent
 * has risen, so the tree spreads outward in waves. Uses the engine's `burrowEmerge` (untargetable until risen).
 */
export function emergeGardenTree(
    engine: EngineContext,
    heart: Unit,
    phase: number,
    grown: ReadonlyMap<string, Unit>,
    options: GardenEmergeOptions,
): void {
    const layout = gardenTreeLayout(phase);
    if (!layout) return;
    const hop = options.travelSeconds + options.riseSeconds;
    const startAt = new Map<string, number>();
    const spotOf = new Map<string, { x: number; y: number }>();
    for (const spec of layout) {
        const unit = grown.get(spec.key);
        if (!unit) continue;
        spotOf.set(spec.key, { x: unit.x, y: unit.y });
        const parentStart = spec.parent === null ? undefined : startAt.get(spec.parent);
        const parentSpot = spec.parent === null ? undefined : spotOf.get(spec.parent);
        // A node whose parent did not emerge with it (it was already standing) sets off at once from the parent.
        const delay = parentStart === undefined ? options.delaySeconds : parentStart + hop;
        const from = parentSpot ?? (spec.parent === null ? { x: heart.x, y: heart.y } : nodeParentPoint(grown, heart, spec, engine));
        startAt.set(spec.key, delay);
        startBurrowEmerge(unit, engine, { from, delaySeconds: delay, travelSeconds: options.travelSeconds, riseSeconds: options.riseSeconds });
    }
}

function peekParentId(unit: Unit): string | null {
    return peekNodeTreeState(unit)?.parentId ?? null;
}

/** Where a node's parent stands when the parent was not grown in the same call. */
function nodeParentPoint(
    grown: ReadonlyMap<string, Unit>,
    heart: Unit,
    spec: GardenNodeSpec,
    engine: EngineContext,
): { x: number; y: number } {
    const unit = grown.get(spec.key);
    const parentId = unit ? peekParentId(unit) : null;
    const parent = parentId ? engine.getUnit(parentId) : undefined;
    return parent ? { x: parent.x, y: parent.y } : { x: heart.x, y: heart.y };
}

/** All living descendants of `root` (children, grandchildren, ...), parents before their children. */
export function gardenTreeDescendants(engine: { getUnit(id: string): Unit | undefined }, root: Unit): Unit[] {
    const out: Unit[] = [];
    const walk = (unit: Unit): void => {
        for (const id of getNodeChildIds(unit)) {
            const child = engine.getUnit(id);
            if (!child) continue;
            out.push(child);
            walk(child);
        }
    };
    walk(root);
    return out;
}

/**
 * Kill every node under `heart` (not the Heart itself), deepest first, so each node's Stem turns to Briar on the tiles
 * it covered and its parent's Shell opens in turn. Each death runs the normal death path (`unit_died`), so Briar,
 * `onLastChildDied` and any death hooks behave as for a kill, minus a killer. Returns how many nodes it dismissed.
 */
export function dismissGardenTree(
    engine: {
        getUnit(id: string): Unit | undefined;
        eventBus: { emit(event: 'unit_died', payload: { unitId: string; killerUnitId: string | null }): void };
    },
    heart: Unit,
): number {
    const doomed = gardenTreeDescendants(engine, heart).reverse();
    for (const unit of doomed) {
        if (!unit.isAlive()) continue;
        // A dismissal is a retreat, not a kill: no Severance, and the Stem always becomes Briar.
        markNodeDismissed(unit);
        unit.hp = 0;
        unit.active = false;
        engine.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }
    return doomed.length;
}
