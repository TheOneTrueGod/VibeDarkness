import type { LanterniteNestMissionConfig } from '../../storylines/types';
import type { Unit } from './Unit';

export interface UnitLanterniteState {
    /** Set on Lanternites from a nest; skips global Lanternite corpse respawn. */
    nestOwnerUnitId: string | null;
    /** Fixed far endpoint for nest-spawn Lanternite patrol legs. */
    patrolFarWorld: { x: number; y: number } | null;
    patrolLeg: 'toFar' | 'toNest';
    /** Runtime config for `lanternite_nest`. */
    nestConfig: LanterniteNestMissionConfig | null;
    /** Spawn pacing + bookkeeping for Lanternites created by this nest. */
    nestSpawnState: { spawnedIds: string[]; nextSpawnAtGameTime: number } | null;
    /** Role assigned by the nest at spawn for networked behavior. */
    role: 'scout' | 'defender' | null;
    /** Scout: ID of the target `nest` POI this scout is pathfinding toward. */
    targetNestPoiId: string | null;
    /** Nest unit: ID of the `nest` POI this nest occupies. */
    homeNestPoiId: string | null;
    /** Scout: game time when construction completes and a new nest should spawn. */
    constructionCompleteAtGameTime: number | null;
    /** Stagger offset: unit is eligible to attack once gameTime reaches this value. */
    attackReadyAtGameTime: number;
    /**
     * Angle (radians) at which this scout stands relative to the nest build target.
     * Assigned at spawn using golden-angle distribution so each scout has a unique offset.
     * Serialized so the scout stays at the same position after a checkpoint restore.
     */
    constructionAngle: number | null;
    /**
     * Runtime-only: true once the construction particle emitter has been registered.
     * Not serialized — the emitter is recreated next tick if needed after a restore.
     */
    constructionEmitterStarted: boolean;
}

export function createLanterniteState(): UnitLanterniteState {
    return {
        nestOwnerUnitId: null,
        patrolFarWorld: null,
        patrolLeg: 'toFar',
        nestConfig: null,
        nestSpawnState: null,
        role: null,
        targetNestPoiId: null,
        homeNestPoiId: null,
        constructionCompleteAtGameTime: null,
        attackReadyAtGameTime: 0,
        constructionAngle: null,
        constructionEmitterStarted: false,
    };
}

/** Serialized before `wallEntryPoint` in Unit.toJSON. */
export function lanterniteStateToJSONBeforeWall(unit: Unit): Record<string, unknown> {
    return {
        ...(unit.lanterniteState.nestOwnerUnitId != null
            ? { lanterniteNestOwnerUnitId: unit.lanterniteState.nestOwnerUnitId }
            : {}),
    };
}

/** Serialized after `wallEntryPoint`, before thornling state in Unit.toJSON. */
export function lanterniteStateToJSONBeforeThornling(unit: Unit): Record<string, unknown> {
    return {
        ...(unit.lanterniteState.patrolFarWorld != null
            ? { lanternPatrolFarWorld: { ...unit.lanterniteState.patrolFarWorld } }
            : {}),
        ...(unit.lanterniteState.patrolLeg !== 'toFar' ? { lanternPatrolLeg: unit.lanterniteState.patrolLeg } : {}),
        ...(unit.lanterniteState.nestConfig != null
            ? {
                  lanterniteNestConfig: JSON.parse(JSON.stringify(unit.lanterniteState.nestConfig)) as LanterniteNestMissionConfig,
              }
            : {}),
        ...(unit.lanterniteState.nestSpawnState != null
            ? {
                  lanterniteNestSpawnState: {
                      spawnedIds: [...unit.lanterniteState.nestSpawnState.spawnedIds],
                      nextSpawnAtGameTime: unit.lanterniteState.nestSpawnState.nextSpawnAtGameTime,
                  },
              }
            : {}),
    };
}

/** Serialized after swarm state in Unit.toJSON. */
export function lanterniteStateToJSONAfterSwarm(unit: Unit): Record<string, unknown> {
    return {
        ...(unit.lanterniteState.role != null ? { lanterniteRole: unit.lanterniteState.role } : {}),
        ...(unit.lanterniteState.targetNestPoiId != null
            ? { lanterniteTargetNestPoiId: unit.lanterniteState.targetNestPoiId }
            : {}),
        ...(unit.lanterniteState.homeNestPoiId != null
            ? { lanterniteHomeNestPoiId: unit.lanterniteState.homeNestPoiId }
            : {}),
        ...(unit.lanterniteState.constructionCompleteAtGameTime != null
            ? { lanterniteConstructionCompleteAtGameTime: unit.lanterniteState.constructionCompleteAtGameTime }
            : {}),
        ...(unit.lanterniteState.attackReadyAtGameTime !== 0
            ? { lanterniteAttackReadyAtGameTime: unit.lanterniteState.attackReadyAtGameTime }
            : {}),
        ...(unit.lanterniteState.constructionAngle != null
            ? { lanterniteConstructionAngle: unit.lanterniteState.constructionAngle }
            : {}),
    };
}

export function lanterniteStateToJSON(unit: Unit): Record<string, unknown> {
    return {
        ...lanterniteStateToJSONBeforeWall(unit),
        ...lanterniteStateToJSONBeforeThornling(unit),
        ...lanterniteStateToJSONAfterSwarm(unit),
    };
}

export function applyLanterniteStateFromJSON(unit: Unit, data: Record<string, unknown>): void {
    if (data.lanterniteNestOwnerUnitId != null) {
        unit.lanterniteState.nestOwnerUnitId = data.lanterniteNestOwnerUnitId as string;
    }
    if (data.lanternPatrolFarWorld != null) {
        const w = data.lanternPatrolFarWorld as { x?: number; y?: number };
        if (typeof w.x === 'number' && typeof w.y === 'number') {
            unit.lanterniteState.patrolFarWorld = { x: w.x, y: w.y };
        }
    }
    if (data.lanternPatrolLeg === 'toNest' || data.lanternPatrolLeg === 'toFar') {
        unit.lanterniteState.patrolLeg = data.lanternPatrolLeg;
    }
    if (data.lanterniteNestConfig != null) {
        unit.lanterniteState.nestConfig = data.lanterniteNestConfig as LanterniteNestMissionConfig;
    }
    if (data.lanterniteNestSpawnState != null) {
        const s = data.lanterniteNestSpawnState as { spawnedIds?: unknown; nextSpawnAtGameTime?: number };
        const ids = Array.isArray(s.spawnedIds)
            ? (s.spawnedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        if (typeof s.nextSpawnAtGameTime === 'number') {
            unit.lanterniteState.nestSpawnState = { spawnedIds: ids, nextSpawnAtGameTime: s.nextSpawnAtGameTime };
        }
    }
    if (data.lanterniteRole === 'scout' || data.lanterniteRole === 'defender') {
        unit.lanterniteState.role = data.lanterniteRole;
    }
    if (typeof data.lanterniteTargetNestPoiId === 'string') {
        unit.lanterniteState.targetNestPoiId = data.lanterniteTargetNestPoiId;
    }
    if (typeof data.lanterniteHomeNestPoiId === 'string') {
        unit.lanterniteState.homeNestPoiId = data.lanterniteHomeNestPoiId;
    }
    if (typeof data.lanterniteConstructionCompleteAtGameTime === 'number') {
        unit.lanterniteState.constructionCompleteAtGameTime = data.lanterniteConstructionCompleteAtGameTime;
    }
    if (typeof data.lanterniteAttackReadyAtGameTime === 'number') {
        unit.lanterniteState.attackReadyAtGameTime = data.lanterniteAttackReadyAtGameTime;
    }
    if (typeof data.lanterniteConstructionAngle === 'number') {
        unit.lanterniteState.constructionAngle = data.lanterniteConstructionAngle;
    }
}
