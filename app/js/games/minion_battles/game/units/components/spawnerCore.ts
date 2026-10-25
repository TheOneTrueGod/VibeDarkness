/**
 * Spawner core: the data-driven part of "a unit that births other units", shared by the lanternite nest and the swarm
 * nest (and the intended home for summoners, boss add waves and on-death spawns).
 *
 * A spawner is a `SpawnerSpec` (what to spawn and how it is paced) plus the unit's own `{ cfg, state }`:
 * - `cfg` is the mission-provided config (cap, interval, burst size) read through the spec's accessors,
 * - `state` is `{ spawnedIds, nextSpawnAtGameTime }`, the pacing and child bookkeeping each component serializes.
 *
 * Shared, so identical for every spawner: prune dead children, cap check, timer check, burst loop, placement around
 * the spawner, team / invulnerability inheritance, child id tracking, and the `max(0.5, interval)` rescheduling.
 * Different per spawner, so a hook: `describeChild` (which AI tree and AI hookup the child gets, or `null` to stop the
 * burst) and the optional `canSpawn` gate.
 *
 * Spawning on death (a rider dismounting, an enemy splitting) is `spawnSpawnerChildren` called from a component
 * `onDeath` hook with an explicit count; it skips pacing and the timer but still honours the cap and tracks ids.
 */

import type { EventBus } from '../../EventBus';
import type { EngineContext } from '../../EngineContext';
import type { MapSegmentPOI } from '../../../terrain/segmentSchema';
import type { MapNetworkManager } from '../../managers/mapNetwork/MapNetworkManager';
import type { SpawnSource } from '../../types';
import type { TeamId } from '../../teams';
import type { Unit } from '../Unit';
import type { AISettings } from '../unitTypes';
import { UnitTag } from '../unitTag';
import { spawnUnit, type SpawnUnitContext } from '../spawning/spawnUnit';
import type { SpawnAiHookup, SpawnDefinition, SpawnPlacement } from '../spawning/spawnDefinition';

/** Pacing and child bookkeeping for one spawner unit. Serialized by the owning component. */
export interface SpawnerState {
    spawnedIds: string[];
    nextSpawnAtGameTime: number;
}

/** Floor for the seconds between spawn bursts (guards a zero or negative configured interval). */
export const MIN_SPAWN_INTERVAL_SEC = 0.5;

/** What each child looks like. Everything except the AI hookup is the same for every child of a spawner. */
export interface SpawnerChildSpec {
    characterId: string;
    name: string;
    abilities: string[];
    /** `'inherit'` = the spawner's own team (hostile nests); a team id = fixed (nature lanternites). */
    team: 'inherit' | TeamId;
    aiSettings: AISettings | null;
    /** Children appear within `spawner.radius + spawnRadiusExtraPx` of the spawner. */
    spawnRadiusExtraPx: number;
    /** Copy the spawner's Invincible tag and `invulnerabilityGenerations - 1` onto each child. */
    inheritInvulnerability: boolean;
    /** Passed through to `spawnUnit` (lanternites tag their children `'nestSpawn'`; the swarm engine wrapper does it instead). */
    spawnSource?: SpawnSource;
}

/** Read-only world view a spawner's hooks need. */
export interface SpawnerEnv {
    units: Unit[];
    gameTime: number;
    mapNetwork?: Pick<MapNetworkManager, 'getNeighborIds' | 'getNode'>;
}

export interface SpawnerSpec<Cfg> {
    child: SpawnerChildSpec;
    /** Cap on living children. */
    maxChildren(cfg: Cfg): number;
    /** Seconds between bursts (floored at `MIN_SPAWN_INTERVAL_SEC`). */
    intervalSec(cfg: Cfg): number;
    /** Children per burst. */
    burstCount(cfg: Cfg): number;
    /**
     * Extra gate checked after the cap and timer. `false` skips this tick WITHOUT rescheduling, so it is retried next
     * tick (the legacy lanternite patrol waits for its destination to exist).
     */
    canSpawn?(spawner: Unit, env: SpawnerEnv): boolean;
    /**
     * The AI tree and hookup for the next child, given how many children are alive before it is added.
     * Return `null` to end the burst early (the timer is still rescheduled).
     */
    describeChild(
        spawner: Unit,
        livingChildren: number,
        env: SpawnerEnv,
    ): {
        /** Omit to let `spawnUnit` resolve its own AI-tree fallback. */
        unitAITreeId?: string;
        aiHookup: SpawnAiHookup;
        /** Explicit placement for this child (e.g. a chosen world point) instead of the default ring around the spawner. */
        placement?: SpawnPlacement;
        /** Fields merged over the generated definition last (stats, tags, ownership), for spawners whose children are not uniform. */
        overrides?: Partial<SpawnDefinition>;
    } | null;
}

/** Fresh state whose first burst is one interval away. */
export function createSpawnerState(gameTime: number, intervalSec: number): SpawnerState {
    return { spawnedIds: [], nextSpawnAtGameTime: gameTime + Math.max(MIN_SPAWN_INTERVAL_SEC, intervalSec) };
}

/** Drop ids of children that are gone or dead. */
export function pruneSpawnedIds(state: SpawnerState, units: readonly Unit[]): void {
    state.spawnedIds = state.spawnedIds.filter((id) => {
        const u = units.find((x) => x.id === id);
        return u != null && u.isAlive();
    });
}

/**
 * Spawn up to `count` children now, stopping at the cap or when `describeChild` returns null. Tracks ids in `state`.
 * Used by `tickSpawner` for the timed burst and callable on its own for one-shot spawns (on death, boss add waves).
 */
export function spawnSpawnerChildren<Cfg>(args: {
    spawner: Unit;
    cfg: Cfg;
    state: SpawnerState;
    spec: SpawnerSpec<Cfg>;
    count: number;
    spawnCtx: SpawnUnitContext;
    env: SpawnerEnv;
}): Unit[] {
    const { spawner, cfg, state, spec, count, spawnCtx, env } = args;
    const child = spec.child;
    const spawned: Unit[] = [];
    for (let burst = 0; burst < count; burst++) {
        // Re-check the cap each iteration: a previous burst member may have filled the spawner.
        if (state.spawnedIds.length >= spec.maxChildren(cfg)) break;
        const livingChildren = state.spawnedIds.length;
        const described = spec.describeChild(spawner, livingChildren, env);
        if (!described) break;

        const [unit] = spawnUnit(
            spawnCtx,
            {
                characterId: child.characterId,
                name: child.name,
                abilities: [...child.abilities],
                teamId: child.team === 'inherit' ? spawner.teamId : child.team,
                unitAITreeId: described.unitAITreeId,
                aiSettings: child.aiSettings ? { ...child.aiSettings } : null,
                placement: described.placement ?? {
                    kind: 'relativeToUnit',
                    anchorUnitId: spawner.id,
                    maxRadiusPx: spawner.radius + child.spawnRadiusExtraPx,
                },
                ...(child.inheritInvulnerability
                    ? {
                          unitTags: spawner.tags.includes(UnitTag.Invincible) ? [UnitTag.Invincible] : undefined,
                          invulnerabilityGenerations:
                              spawner.invulnerabilityGenerations != null
                                  ? Math.max(0, spawner.invulnerabilityGenerations - 1)
                                  : undefined,
                      }
                    : {}),
                aiHookup: described.aiHookup,
                ...described.overrides,
            },
            child.spawnSource,
        );
        if (!unit) break;
        state.spawnedIds.push(unit.id);
        spawned.push(unit);
    }
    return spawned;
}

/**
 * One pacing step for a spawner: prune, cap check, timer check, optional gate, burst, reschedule.
 * No-op when `cfg` or `state` is missing.
 */
export function tickSpawner<Cfg>(args: {
    spawner: Unit;
    cfg: Cfg | null;
    state: SpawnerState | null;
    spec: SpawnerSpec<Cfg>;
    spawnCtx: SpawnUnitContext;
    env: SpawnerEnv;
}): void {
    const { spawner, cfg, state, spec, spawnCtx, env } = args;
    if (!cfg || !state) return;

    pruneSpawnedIds(state, env.units);

    if (state.spawnedIds.length >= spec.maxChildren(cfg)) return;
    if (env.gameTime < state.nextSpawnAtGameTime) return;
    if (spec.canSpawn && !spec.canSpawn(spawner, env)) return;

    spawnSpawnerChildren({ spawner, cfg, state, spec, count: spec.burstCount(cfg), spawnCtx, env });

    state.nextSpawnAtGameTime = env.gameTime + Math.max(MIN_SPAWN_INTERVAL_SEC, spec.intervalSec(cfg));
}

/** The `spawnUnit` context every nest-style tick builds (no terrain, no lighting, deterministic RNG from the engine). */
export function buildNestSpawnContext(params: {
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit, spawnSource?: SpawnSource) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'>;
    mapPOIs?: readonly MapSegmentPOI[];
    generateRandomInteger: (min: number, max: number) => number;
}): SpawnUnitContext {
    return {
        units: params.units,
        eventBus: params.eventBus,
        addUnit: params.addUnit,
        terrainManager: null,
        lightLevelEnabled: false,
        aiControllerId: null,
        mapPOIs: params.mapPOIs ?? [],
        getLightAt: () => null,
        getZoneById: () => undefined,
        generateRandomInteger: params.generateRandomInteger,
        allocateObjectId: params.idSource?.allocateObjectId?.bind(params.idSource),
    };
}

/**
 * Shared construction: builders at the same site pool their effort, so N builders finish N times faster than one.
 * Each builder beyond the first pulls the group's (already synced) completion time closer by one extra `dt` per tick.
 * `siteOf` returns the site a unit is building at (null when not building).
 */
export function poolSharedConstruction(params: {
    units: readonly Unit[];
    gameTime: number;
    dt: number;
    siteOf(unit: Unit): string | null | undefined;
    completeAtOf(unit: Unit): number | null | undefined;
    setCompleteAt(unit: Unit, gameTime: number): void;
}): void {
    const buildersBySite = new Map<string, Unit[]>();
    for (const u of params.units) {
        if (!u.isAlive()) continue;
        const siteId = params.siteOf(u);
        const completeAt = params.completeAtOf(u);
        if (siteId == null || completeAt == null || completeAt <= params.gameTime) continue;
        const group = buildersBySite.get(siteId);
        if (group) group.push(u);
        else buildersBySite.set(siteId, [u]);
    }
    for (const group of buildersBySite.values()) {
        if (group.length < 2) continue;
        const extra = (group.length - 1) * params.dt;
        for (const u of group) {
            params.setCompleteAt(u, Math.max(params.gameTime, params.completeAtOf(u)! - extra));
        }
    }
}
