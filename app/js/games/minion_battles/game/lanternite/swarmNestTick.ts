/**
 * Swarm Nest — periodically spawns swarmlings that seek unclaimed nest POIs and build new nests.
 * Follows the same pattern as thornlingNestTick.ts for spawning, and lanterniteNestTick.ts
 * for construction completion and the golden-angle orbit-angle assignment.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import type { MapSegmentPOI } from '../../terrain/segmentSchema';
import type { SwarmNestMissionConfig } from '../../storylines/types';
import type { MapNetworkManager } from '../managers/mapNetwork/MapNetworkManager';
import type { NetworkNode } from '../managers/mapNetwork/types';
import { spawnUnit, type SpawnUnitContext } from '../units/spawning/spawnUnit';

export const SWARM_NEST_CHARACTER_ID = 'swarm_nest';
export const SWARM_NEST_SWARMLING_CHARACTER_ID = 'swarmling';

/** Swarmling bite ability ID. */
const SWARMLING_BITE_ABILITY_ID = '0013';

/** Swarmling network AI tree. */
const SWARMLING_AI_TREE_ID = 'swarmlingNetwork';

/**
 * Golden angle in radians (~137.5°). Distributes swarmlings' orbit slots around a nest POI
 * so each swarmling stands at a distinct angle when multiple arrive at the same site.
 */
const GOLDEN_ANGLE = 2.399963229728653;

/** Extra px beyond the nest's own radius within which swarmlings may spawn. */
const NEST_SPAWN_EXTRA_RADIUS = 60;

/** Default seconds a swarmling waits at a POI before the new nest spawns. */
const DEFAULT_CONSTRUCTION_SEC = 10;

/** Read-only query surface `findUnclaimedNetworkNode`/`processSwarmNests` need — mirrors
 *  `lanterniteNestTick.ts`'s `MapNetworkQuery` `Pick<...>` restriction (query only, no
 *  `tick`/`loadFromSegments`). */
type MapNetworkQuery = Pick<MapNetworkManager, 'getAllNodeIds' | 'getNode'>;

function pruneSpawnedIds(nest: Unit, units: readonly Unit[]): void {
    const state = nest.swarmState.nestSpawnState;
    if (!state) return;
    state.spawnedIds = state.spawnedIds.filter((id) => {
        const u = units.find((x) => x.id === id);
        return u != null && u.isAlive();
    });
}

/**
 * Find the nearest unclaimed network node: one that has no live swarm_nest currently calling it
 * home and no live swarmling already targeting it.
 *
 * Design notes — see `docs/plans/swarm-nest-network-migration.md` decisions #1/#2. Do not "fix"
 * this to match lanternite's `findUnoccupiedConnectedNestPoi`:
 *  - No `mapNetwork.getOwnerCharacterId` call: swarm nests are meant to *always contest* a node
 *    regardless of which faction already holds it — that's what drives the contested-nest-site
 *    fights lanternite's `isNestSiteContested` reacts to. Only the swarm's own units
 *    (`homeNestPoiId`/`targetNestPoiId`) exclude a node here, same as before this migration.
 *  - No neighbor-only traversal (`mapNetwork.getNeighborIds`): swarm scans every node in the
 *    graph and picks nearest-by-distance, unlike lanternite's neighbor-restricted selection. This
 *    is a deliberate, pre-existing behavior difference, not an oversight to "align."
 */
export function findUnclaimedNetworkNode(
    sourceX: number,
    sourceY: number,
    mapNetwork: MapNetworkQuery,
    allUnits: readonly Unit[],
): NetworkNode | null {
    const occupiedNodeIds = new Set<string>();
    for (const u of allUnits) {
        if (!u.isAlive()) continue;
        if (u.swarmState.homeNestPoiId) occupiedNodeIds.add(u.swarmState.homeNestPoiId);
        if (u.swarmState.targetNestPoiId) occupiedNodeIds.add(u.swarmState.targetNestPoiId);
    }

    let best: NetworkNode | null = null;
    let bestDist = Infinity;

    for (const nodeId of mapNetwork.getAllNodeIds()) {
        if (occupiedNodeIds.has(nodeId)) continue;
        const node = mapNetwork.getNode(nodeId);
        if (!node) continue;
        const dx = node.x - sourceX;
        const dy = node.y - sourceY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = node;
        }
    }

    return best;
}

export function initializeSwarmNestSpawnState(nest: Unit, gameTime: number): void {
    const cfg = nest.swarmState.nestConfig;
    if (!cfg) return;
    nest.swarmState.nestSpawnState = {
        spawnedIds: [],
        nextSpawnAtGameTime: gameTime + Math.max(0.5, cfg.spawnIntervalSec),
    };
}

/**
 * Advances swarm nest spawn timers once per simulation tick (host-only).
 * Also handles swarmling construction completion — spawns a new swarm nest at the target POI
 * and removes the swarmling.
 */
export function processSwarmNests(params: {
    gameTime: number;
    /** Seconds elapsed this simulation tick — drives shared-construction acceleration below. */
    dt: number;
    units: Unit[];
    eventBus: EventBus;
    addUnit: (unit: Unit) => void;
    idSource?: Pick<EngineContext, 'allocateObjectId'>;
    mapPOIs?: readonly MapSegmentPOI[];
    /** Read-only map-network query surface — resolves nest targets via the node graph instead of the old flat POI scan. Optional, matching `mapPOIs`'s convention. */
    mapNetwork?: MapNetworkQuery;
    /** Seeded RNG source — must be passed from the engine so spawn positions are deterministic across clients. */
    generateRandomInteger: (min: number, max: number) => number;
}): void {
    const spawnCtx: SpawnUnitContext = {
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

    // --- Shared construction: swarmlings building at the same POI pool their effort, so N
    // swarmlings at one site finish N times faster than a lone one. Each additional swarmling
    // beyond the first pulls the group's (already-synced, see snet_seek.ts's join logic) shared
    // completion time closer by one extra `dt` this tick.
    {
        const buildersByPoi = new Map<string, Unit[]>();
        for (const u of params.units) {
            if (!u.isAlive()) continue;
            const poiId = u.swarmState.targetNestPoiId;
            const completeAt = u.swarmState.constructionCompleteAtGameTime;
            if (poiId == null || completeAt == null || completeAt <= params.gameTime) continue;
            const group = buildersByPoi.get(poiId);
            if (group) group.push(u);
            else buildersByPoi.set(poiId, [u]);
        }
        for (const group of buildersByPoi.values()) {
            if (group.length < 2) continue;
            const extra = (group.length - 1) * params.dt;
            for (const u of group) {
                u.swarmState.constructionCompleteAtGameTime = Math.max(
                    params.gameTime,
                    u.swarmState.constructionCompleteAtGameTime! - extra,
                );
            }
        }
    }

    // --- Construction completion: swarmlings that have finished building ---
    for (const unit of params.units) {
        if (
            !unit.isAlive() ||
            unit.characterId !== SWARM_NEST_SWARMLING_CHARACTER_ID ||
            unit.swarmState.constructionCompleteAtGameTime == null ||
            params.gameTime < unit.swarmState.constructionCompleteAtGameTime
        ) {
            continue;
        }

        const targetPoiId = unit.swarmState.targetNestPoiId;

        // Skip if another swarmling already built a nest at this POI
        if (targetPoiId != null) {
            const alreadyOccupied = params.units.some(
                (u) =>
                    u.characterId === SWARM_NEST_CHARACTER_ID &&
                    u.isAlive() &&
                    u.swarmState.homeNestPoiId === targetPoiId,
            );
            if (alreadyOccupied) {
                unit.hp = 0;
                unit.active = false;
                params.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
                continue;
            }
        }

        const targetNode = targetPoiId ? (params.mapNetwork?.getNode(targetPoiId) ?? null) : null;

        if (targetNode) {
            // Node positions are already mission-global px — no `terrainGrid.gridToWorld`
            // conversion needed (unlike the old POI-tag path), mirrors lanternite's cleanup.

            // Resolve config from swarmling's parent nest
            const parentNest = unit.swarmState.nestOwnerUnitId
                ? params.units.find((u) => u.id === unit.swarmState.nestOwnerUnitId && u.isAlive())
                : null;
            const cfg: SwarmNestMissionConfig = parentNest?.swarmState.nestConfig ?? {
                maxSwarmlings: 3,
                spawnIntervalSec: 8,
            };

            const [newNest] = spawnUnit(spawnCtx, {
                characterId: SWARM_NEST_CHARACTER_ID,
                name: 'Swarm Nest',
                abilities: [],
                teamId: unit.teamId,
                unitAITreeId: 'lanterniteNestIdle',
                aiSettings: null,
                placement: { kind: 'fixedWorld', x: targetNode.x, y: targetNode.y },
                aiHookup: { kind: 'swarmNest', nestConfig: { ...cfg }, homeNestPoiId: targetPoiId ?? undefined },
            });
            initializeSwarmNestSpawnState(newNest, params.gameTime);
        }

        // Remove the swarmling that completed construction
        unit.hp = 0;
        unit.active = false;
    }

    // --- Spawn swarmlings from each live swarm_nest ---
    for (const nest of params.units) {
        if (!nest.isAlive() || nest.characterId !== SWARM_NEST_CHARACTER_ID) continue;

        const cfg = nest.swarmState.nestConfig;
        const state = nest.swarmState.nestSpawnState;
        if (!cfg || !state) continue;

        pruneSpawnedIds(nest, params.units);

        if (state.spawnedIds.length >= cfg.maxSwarmlings) continue;
        if (params.gameTime < state.nextSpawnAtGameTime) continue;

        const burstCount = cfg.spawnCount ?? 1;

        for (let burst = 0; burst < burstCount; burst++) {
            if (state.spawnedIds.length >= cfg.maxSwarmlings) break;

            const aliveCount = state.spawnedIds.length;
            const orbitAngle = (aliveCount * GOLDEN_ANGLE) % (Math.PI * 2);

            // Assign target node if available
            let targetNestPoiId: string | undefined;
            if (params.mapNetwork) {
                const targetNode = findUnclaimedNetworkNode(nest.x, nest.y, params.mapNetwork, params.units);
                if (targetNode) targetNestPoiId = targetNode.id;
            }

            const [child] = spawnUnit(spawnCtx, {
                characterId: SWARM_NEST_SWARMLING_CHARACTER_ID,
                name: 'Swarmling',
                abilities: [SWARMLING_BITE_ABILITY_ID],
                teamId: nest.teamId,
                unitAITreeId: SWARMLING_AI_TREE_ID,
                aiSettings: { minRange: 0, maxRange: 70 },
                placement: {
                    kind: 'relativeToUnit',
                    anchorUnitId: nest.id,
                    maxRadiusPx: nest.radius + NEST_SPAWN_EXTRA_RADIUS,
                },
                aiHookup: { kind: 'swarm', orbitAngle, targetNestPoiId, nestOwnerUnitId: nest.id },
            });
            state.spawnedIds.push(child.id);
        }

        state.nextSpawnAtGameTime = params.gameTime + Math.max(0.5, cfg.spawnIntervalSec);
    }
}

/** Expose construction constant so the AI node can read it. */
export { DEFAULT_CONSTRUCTION_SEC as SWARM_DEFAULT_CONSTRUCTION_SEC };
