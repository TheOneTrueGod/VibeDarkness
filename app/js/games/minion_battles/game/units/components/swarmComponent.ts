import type { SwarmNestMissionConfig } from '../../../storylines/types';
import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions, getComponentState } from './unitComponent';

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

/** Declared on `swarmling` (role `swarmling`) and `swarm_nest` (role `nest`). */
export interface SwarmComponentOptions {
    role: 'swarmling' | 'nest';
}

/** Keys are written at the unit's top level exactly as before components existed (`swarmNestConfig`, `swarmling*`, ...). */
function swarmStateToJSON(state: UnitSwarmState): Record<string, unknown> {
    return {
        ...(state.nestConfig != null
            ? {
                  swarmNestConfig: JSON.parse(JSON.stringify(state.nestConfig)) as SwarmNestMissionConfig,
              }
            : {}),
        ...(state.nestSpawnState != null
            ? {
                  swarmNestSpawnState: {
                      spawnedIds: [...state.nestSpawnState.spawnedIds],
                      nextSpawnAtGameTime: state.nestSpawnState.nextSpawnAtGameTime,
                  },
              }
            : {}),
        ...(state.homeNestPoiId != null ? { swarmHomeNestPoiId: state.homeNestPoiId } : {}),
        ...(state.orbitAngle != null ? { swarmlingOrbitAngle: state.orbitAngle } : {}),
        ...(state.currentNodeId != null
            ? { swarmlingCurrentNodeId: state.currentNodeId }
            : {}),
        ...(state.targetNodeId != null
            ? { swarmlingTargetNodeId: state.targetNodeId }
            : {}),
        ...(state.nestOwnerUnitId != null
            ? { swarmlingNestOwnerUnitId: state.nestOwnerUnitId }
            : {}),
        ...(state.constructionCompleteAtGameTime != null
            ? { swarmlingConstructionCompleteAtGameTime: state.constructionCompleteAtGameTime }
            : {}),
    };
}

function applySwarmStateFromJSON(state: UnitSwarmState, data: Record<string, unknown>): void {
    if (data.swarmNestConfig != null) {
        state.nestConfig = data.swarmNestConfig as SwarmNestMissionConfig;
    }
    if (data.swarmNestSpawnState != null) {
        const s = data.swarmNestSpawnState as { spawnedIds?: unknown; nextSpawnAtGameTime?: number };
        const ids = Array.isArray(s.spawnedIds)
            ? (s.spawnedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        if (typeof s.nextSpawnAtGameTime === 'number') {
            state.nestSpawnState = { spawnedIds: ids, nextSpawnAtGameTime: s.nextSpawnAtGameTime };
        }
    }
    if (typeof data.swarmHomeNestPoiId === 'string') {
        state.homeNestPoiId = data.swarmHomeNestPoiId;
    }
    if (typeof data.swarmlingOrbitAngle === 'number') {
        state.orbitAngle = data.swarmlingOrbitAngle;
    }
    if (typeof data.swarmlingCurrentNodeId === 'string') {
        state.currentNodeId = data.swarmlingCurrentNodeId;
    }
    if (typeof data.swarmlingTargetNodeId === 'string') {
        state.targetNodeId = data.swarmlingTargetNodeId;
    }
    if (typeof data.swarmlingNestOwnerUnitId === 'string') {
        state.nestOwnerUnitId = data.swarmlingNestOwnerUnitId;
    }
    if (typeof data.swarmlingConstructionCompleteAtGameTime === 'number') {
        state.constructionCompleteAtGameTime = data.swarmlingConstructionCompleteAtGameTime;
    }
}

export const SWARM_COMPONENT = defineUnitComponent<UnitSwarmState, SwarmComponentOptions>({
    id: 'swarm',
    create: () => createSwarmState(),
    toJSON: swarmStateToJSON,
    fromJSON: applySwarmStateFromJSON,
});

/** Swarm state for `unit`, attaching a default slice if the unit does not carry one. */
export function swarmStateOf(unit: Unit): UnitSwarmState {
    return getComponentState(unit, SWARM_COMPONENT);
}

/** Swarm state if the unit carries it. Use in scans over many units. */
export function peekSwarmState(unit: Unit): UnitSwarmState | undefined {
    return findComponentState(unit, SWARM_COMPONENT);
}

/** Declared role (`swarmling` or `nest`); undefined when the unit's def does not declare the component. */
export function swarmRoleOf(unit: Unit): SwarmComponentOptions['role'] | undefined {
    return getComponentOptions(unit, SWARM_COMPONENT)?.role;
}

/** True for a unit whose def declares the swarm component with the `nest` role. */
export function isSwarmNest(unit: Unit): boolean {
    return swarmRoleOf(unit) === 'nest';
}

/** True for a unit whose def declares the swarm component with the `swarmling` role. */
export function isSwarmling(unit: Unit): boolean {
    return swarmRoleOf(unit) === 'swarmling';
}
