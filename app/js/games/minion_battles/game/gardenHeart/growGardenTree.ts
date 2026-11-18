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
import { getNodeChildIds } from '../units/components/nodeTree';
import type { SpawnDefinition } from '../units/spawning/spawnDefinition';
import type { SpawnUnitContext } from '../units/spawning/spawnUnit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { GARDEN_GROWTH_PHASE_VARIABLE, STEM_LEASH_PX } from '../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { setBattleVariable } from '../battleVariables';
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
    setBattleVariable(ctx, GARDEN_GROWTH_PHASE_VARIABLE, phase);
    const origin = options.at ?? { x: heart.x, y: heart.y };
    for (const spec of layout) {
        const parent = spec.parent === null ? heart : grown.get(spec.parent);
        if (!parent) {
            throw new Error(`growGardenTree: node "${spec.key}" names parent "${spec.parent}" that is not earlier in the table`);
        }
        const anchor = spec.parent === null ? origin : { x: parent.x, y: parent.y };
        const wanted = nodeWantedPoint(anchor, spec);
        const at = nearestPassablePoint(ctx.terrainManager, wanted.x, wanted.y);
        const unit = spawnNodeChild(ctx, parent, buildNodeSpawn(spec, heart.teamId, ctx.enemyScalingPlayerCount, at), {
            tetherMaxLength: Math.max(STEM_LEASH_PX, Math.hypot(at.x - anchor.x, at.y - anchor.y) + CELL_SIZE),
        });
        if (unit) grown.set(spec.key, unit);
    }
    return grown;
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
        unit.hp = 0;
        unit.active = false;
        engine.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
    }
    return doomed.length;
}
