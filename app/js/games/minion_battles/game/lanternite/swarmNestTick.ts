/**
 * Swarm Nest — periodically spawns swarmlings that seek unclaimed nest POIs and build new nests.
 * Follows the same pattern as lanterniteNestTick.ts
 * for construction completion and the golden-angle orbit-angle assignment.
 */

import type { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import type { Unit } from '../units/Unit';
import type { MapSegmentPOI } from '../../terrain/segmentSchema';
import type { SwarmNestMissionConfig } from '../../storylines/types';
import type { MapNetworkManager } from '../managers/mapNetwork/MapNetworkManager';
import type { NetworkNode } from '../managers/mapNetwork/types';
import { spawnUnit } from '../units/spawning/spawnUnit';
import {
    buildNestSpawnContext,
    createSpawnerState,
    poolSharedConstruction,
    tickSpawner,
    type SpawnerEnv,
    type SpawnerSpec,
} from '../units/components/spawnerCore';
import { resolveNearestNodeId, findNearestNodeByHops } from '../managers/mapNetwork/graphSearch';
import { isSwarmNest, isSwarmling, peekSwarmState, swarmStateOf } from '../units/components/swarmComponent';

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
 *  `buildInitialMembership`/`updateUnitNode`/`loadFromSegments`). */
type MapNetworkQuery = Pick<
    MapNetworkManager,
    'getAllNodeIds' | 'getNode' | 'getNeighborIds' | 'findNodeContainingPosition'
>;

/**
 * The swarm nest as a spawner (see `units/components/spawnerCore.ts`). The shared core owns pacing, cap, burst and
 * placement; this spec supplies the swarmling's static shape. A swarmling inherits the nest's team, gets a golden-angle
 * orbit slot, and starts with no target node: `currentNodeId`/`targetNodeId` are resolved lazily on its first
 * `snet_seek` tick (its spawn position, near the nest's own node, counts as an implicit first arrival), so it hops
 * node-to-node by population gradient instead of beelining at a pre-computed distant target.
 */
export const SWARM_SPAWNER: SpawnerSpec<SwarmNestMissionConfig> = {
    child: {
        characterId: SWARM_NEST_SWARMLING_CHARACTER_ID,
        name: 'Swarmling',
        abilities: [SWARMLING_BITE_ABILITY_ID],
        team: 'inherit',
        aiSettings: { minRange: 0, maxRange: 70 },
        spawnRadiusExtraPx: NEST_SPAWN_EXTRA_RADIUS,
        inheritInvulnerability: false,
    },
    maxChildren: (cfg) => cfg.maxSwarmlings,
    intervalSec: (cfg) => cfg.spawnIntervalSec,
    burstCount: (cfg) => cfg.spawnCount ?? 1,
    describeChild(nest, aliveCount, _env) {
        const orbitAngle = (aliveCount * GOLDEN_ANGLE) % (Math.PI * 2);
        const cfg = swarmStateOf(nest).nestConfig!;
        return {
            unitAITreeId: cfg.spawnAITreeId ?? SWARMLING_AI_TREE_ID,
            aiHookup: { kind: 'swarm', orbitAngle, nestOwnerUnitId: nest.id },
        };
    },
};

/**
 * True if a living `swarm_nest` structure already calls `nodeId` home. Deliberately does NOT
 * treat an in-progress construction (a swarmling already settled and building there) as a claim —
 * multiple swarmlings converging on the same unfinished site is the intended "shared construction"
 * behavior (see the existing-builder join logic in `snet_seek.ts`, which accelerates completion
 * per additional contributor via `processSwarmNests`'s shared-construction pooling). Only the
 * finished structure actually reserves the node against further targeting.
 */
export function isNodeClaimedBySwarm(nodeId: string, allUnits: readonly Unit[]): boolean {
    return allUnits.some((u) => u.isAlive() && isSwarmNest(u) && swarmStateOf(u).homeNestPoiId === nodeId);
}

/**
 * True if `nodeId` is a valid, currently-unclaimed nest build site: it exists, is tagged `'nest'`,
 * and is not claimed per `isNodeClaimedBySwarm`. Used both by `findUnclaimedNetworkNode`'s
 * bootstrap search and by `snet_seek.ts`'s per-arrival eligibility check.
 */
export function isValidUnclaimedBuildNode(
    nodeId: string,
    mapNetwork: Pick<MapNetworkManager, 'getNode'>,
    allUnits: readonly Unit[],
): boolean {
    const node = mapNetwork.getNode(nodeId);
    if (!node || !node.tags.includes('nest')) return false;
    return !isNodeClaimedBySwarm(nodeId, allUnits);
}

/**
 * Bootstrap-only direction-picker: used by `snet_seek.ts` when a swarmling has no population
 * gradient signal to follow yet (e.g. population is uniformly flat at mission start). Primary
 * metric is graph-hop count via BFS outward from the node nearest `(sourceX, sourceY)`. Falls
 * back to whole-graph straight-line-nearest among unclaimed candidates when the source node has
 * no BFS-reachable unclaimed candidate (e.g. a disconnected graph/component) — preserves the
 * pre-existing guarantee that a target is always found if one exists anywhere.
 *
 * Design notes — see `docs/plans/done/swarm-nest-network-migration.md` decisions #1/#2. Do not "fix"
 * this to match lanternite's `findUnoccupiedConnectedNestPoi`: no `mapNetwork.getOwnerCharacterId`
 * call — swarm nests are meant to *always contest* a node regardless of which faction already
 * holds it, that's what drives the contested-nest-site fights lanternite's `isNestSiteContested`
 * reacts to. Only the swarm's own claims (`isNodeClaimedBySwarm`) exclude a node here.
 */
export function findUnclaimedNetworkNode(
    sourceX: number,
    sourceY: number,
    mapNetwork: MapNetworkQuery,
    allUnits: readonly Unit[],
): NetworkNode | null {
    const isCandidate = (nodeId: string) => isValidUnclaimedBuildNode(nodeId, mapNetwork, allUnits);

    const fromId = resolveNearestNodeId(sourceX, sourceY, mapNetwork);
    if (fromId) {
        const viaHops = findNearestNodeByHops(mapNetwork, fromId, isCandidate);
        if (viaHops) return mapNetwork.getNode(viaHops) ?? null;
    }

    // Euclidean fallback across every node in the graph, unclaimed-only — covers a disconnected
    // graph/component where BFS from fromId can't reach any candidate.
    let best: NetworkNode | null = null;
    let bestDist = Infinity;
    for (const nodeId of mapNetwork.getAllNodeIds()) {
        if (!isCandidate(nodeId)) continue;
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
    const cfg = swarmStateOf(nest).nestConfig;
    if (!cfg) return;
    swarmStateOf(nest).nestSpawnState = createSpawnerState(gameTime, cfg.spawnIntervalSec);
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
    const spawnCtx = buildNestSpawnContext(params);

    // --- Shared construction: swarmlings building at the same POI pool their effort, so N
    // swarmlings at one site finish N times faster than a lone one. Each additional swarmling
    // beyond the first pulls the group's (already-synced, see snet_seek.ts's join logic) shared
    // completion time closer by one extra `dt` this tick.
    poolSharedConstruction({
        units: params.units,
        gameTime: params.gameTime,
        dt: params.dt,
        siteOf: (u) => peekSwarmState(u)?.currentNodeId,
        completeAtOf: (u) => peekSwarmState(u)?.constructionCompleteAtGameTime,
        setCompleteAt: (u, t) => {
            swarmStateOf(u).constructionCompleteAtGameTime = t;
        },
    });

    // --- Construction completion: swarmlings that have finished building ---
    for (const unit of params.units) {
        const builderState = peekSwarmState(unit);
        if (
            !unit.isAlive() ||
            !isSwarmling(unit) ||
            builderState?.constructionCompleteAtGameTime == null ||
            params.gameTime < builderState.constructionCompleteAtGameTime
        ) {
            continue;
        }

        const targetPoiId = swarmStateOf(unit).currentNodeId;

        // Skip if another swarmling already built a nest at this POI
        if (targetPoiId != null) {
            const alreadyOccupied = params.units.some(
                (u) => isSwarmNest(u) && u.isAlive() && swarmStateOf(u).homeNestPoiId === targetPoiId,
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
            const parentNest = swarmStateOf(unit).nestOwnerUnitId
                ? params.units.find((u) => u.id === swarmStateOf(unit).nestOwnerUnitId && u.isAlive())
                : null;
            const cfg: SwarmNestMissionConfig = (parentNest ? swarmStateOf(parentNest).nestConfig : null) ?? {
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

    // --- Spawn swarmlings from each live swarm_nest (shared spawner core; see SWARM_SPAWNER) ---
    const spawnerEnv: SpawnerEnv = { units: params.units, gameTime: params.gameTime };
    for (const nest of params.units) {
        if (!nest.isAlive() || !isSwarmNest(nest)) continue;
        const nestState = swarmStateOf(nest);
        tickSpawner({
            spawner: nest,
            cfg: nestState.nestConfig,
            state: nestState.nestSpawnState,
            spec: SWARM_SPAWNER,
            spawnCtx,
            env: spawnerEnv,
        });
    }
}

/** Expose construction constant so the AI node can read it. */
export { DEFAULT_CONSTRUCTION_SEC as SWARM_DEFAULT_CONSTRUCTION_SEC };
