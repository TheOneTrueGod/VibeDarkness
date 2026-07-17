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
    /** Swarmling: ID of the target `nest` POI this swarmling is pathfinding toward to build a nest. */
    targetNestPoiId: string | null;
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
        targetNestPoiId: null,
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
        ...(unit.swarmState.targetNestPoiId != null
            ? { swarmlingTargetNestPoiId: unit.swarmState.targetNestPoiId }
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
    if (typeof data.swarmlingTargetNestPoiId === 'string') {
        unit.swarmState.targetNestPoiId = data.swarmlingTargetNestPoiId;
    }
    if (typeof data.swarmlingNestOwnerUnitId === 'string') {
        unit.swarmState.nestOwnerUnitId = data.swarmlingNestOwnerUnitId;
    }
    if (typeof data.swarmlingConstructionCompleteAtGameTime === 'number') {
        unit.swarmState.constructionCompleteAtGameTime = data.swarmlingConstructionCompleteAtGameTime;
    }
}
