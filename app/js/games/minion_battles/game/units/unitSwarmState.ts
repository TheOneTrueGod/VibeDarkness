import type { SwarmNestMissionConfig } from '../../storylines/types';
import type { Unit } from './Unit';

export interface UnitSwarmState {
    /** Runtime config for `swarm_nest`. */
    nestConfig: SwarmNestMissionConfig | null;
    /** Spawn pacing + bookkeeping for swarmlings created by this swarm nest. */
    nestSpawnState: { spawnedIds: string[]; nextSpawnAtGameTime: number } | null;
    /** Swarm nest: ID of the `nest` POI this swarm nest occupies. */
    homeNestPoiId: string | null;
    /** Swarmling: golden-angle orbit slot (radians). Used for ring positioning around both nest POIs and hunt targets. */
    orbitAngle: number | null;
    /** Swarmling: id of the network node this unit last confirmed arrival at (its spawn node
     *  counts as an implicit first arrival). Updated only on arrival, never while in transit —
     *  see `snet_seek.ts`'s reassign-on-arrival state machine. */
    currentNodeId: string | null;
    /** Swarmling: id of the network node this unit has committed to as its next hop while in
     *  transit. `null` means the unit is stationary at `currentNodeId` and due for a fresh
     *  gradient decision. Cleared back to `null` on arrival, at which point `currentNodeId`
     *  becomes this value. */
    targetNodeId: string | null;
    /** Swarmling: unit ID of the swarm nest that spawned this swarmling. */
    nestOwnerUnitId: string | null;
    /** Swarmling: game time when construction completes and a new swarm nest should spawn. */
    constructionCompleteAtGameTime: number | null;
}

export function createSwarmState(): UnitSwarmState {
    return {
        nestConfig: null,
        nestSpawnState: null,
        homeNestPoiId: null,
        orbitAngle: null,
        currentNodeId: null,
        targetNodeId: null,
        nestOwnerUnitId: null,
        constructionCompleteAtGameTime: null,
    };
}

export function swarmStateToJSON(unit: Unit): Record<string, unknown> {
    return {
        ...(unit.swarmState.nestConfig != null
            ? {
                  swarmNestConfig: JSON.parse(JSON.stringify(unit.swarmState.nestConfig)) as SwarmNestMissionConfig,
              }
            : {}),
        ...(unit.swarmState.nestSpawnState != null
            ? {
                  swarmNestSpawnState: {
                      spawnedIds: [...unit.swarmState.nestSpawnState.spawnedIds],
                      nextSpawnAtGameTime: unit.swarmState.nestSpawnState.nextSpawnAtGameTime,
                  },
              }
            : {}),
        ...(unit.swarmState.homeNestPoiId != null ? { swarmHomeNestPoiId: unit.swarmState.homeNestPoiId } : {}),
        ...(unit.swarmState.orbitAngle != null ? { swarmlingOrbitAngle: unit.swarmState.orbitAngle } : {}),
        ...(unit.swarmState.currentNodeId != null
            ? { swarmlingCurrentNodeId: unit.swarmState.currentNodeId }
            : {}),
        ...(unit.swarmState.targetNodeId != null
            ? { swarmlingTargetNodeId: unit.swarmState.targetNodeId }
            : {}),
        ...(unit.swarmState.nestOwnerUnitId != null
            ? { swarmlingNestOwnerUnitId: unit.swarmState.nestOwnerUnitId }
            : {}),
        ...(unit.swarmState.constructionCompleteAtGameTime != null
            ? { swarmlingConstructionCompleteAtGameTime: unit.swarmState.constructionCompleteAtGameTime }
            : {}),
    };
}

export function applySwarmStateFromJSON(unit: Unit, data: Record<string, unknown>): void {
    if (data.swarmNestConfig != null) {
        unit.swarmState.nestConfig = data.swarmNestConfig as SwarmNestMissionConfig;
    }
    if (data.swarmNestSpawnState != null) {
        const s = data.swarmNestSpawnState as { spawnedIds?: unknown; nextSpawnAtGameTime?: number };
        const ids = Array.isArray(s.spawnedIds)
            ? (s.spawnedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        if (typeof s.nextSpawnAtGameTime === 'number') {
            unit.swarmState.nestSpawnState = { spawnedIds: ids, nextSpawnAtGameTime: s.nextSpawnAtGameTime };
        }
    }
    if (typeof data.swarmHomeNestPoiId === 'string') {
        unit.swarmState.homeNestPoiId = data.swarmHomeNestPoiId;
    }
    if (typeof data.swarmlingOrbitAngle === 'number') {
        unit.swarmState.orbitAngle = data.swarmlingOrbitAngle;
    }
    if (typeof data.swarmlingCurrentNodeId === 'string') {
        unit.swarmState.currentNodeId = data.swarmlingCurrentNodeId;
    }
    if (typeof data.swarmlingTargetNodeId === 'string') {
        unit.swarmState.targetNodeId = data.swarmlingTargetNodeId;
    }
    if (typeof data.swarmlingNestOwnerUnitId === 'string') {
        unit.swarmState.nestOwnerUnitId = data.swarmlingNestOwnerUnitId;
    }
    if (typeof data.swarmlingConstructionCompleteAtGameTime === 'number') {
        unit.swarmState.constructionCompleteAtGameTime = data.swarmlingConstructionCompleteAtGameTime;
    }
}
