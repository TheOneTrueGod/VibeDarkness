import type { LanterniteNestMissionConfig } from '../../../storylines/types';
import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions, getComponentState } from './unitComponent';

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

/**
 * Lanternite family component. Declared on `lanternite` (role `creature`) and `lanternite_nest` (role `nest`);
 * both roles share one state shape because scouts carry their nest's config and nests carry child bookkeeping.
 */
export interface LanterniteComponentOptions {
    role: 'creature' | 'nest';
}

/**
 * JSON keys are written at the unit's top level exactly as they were before components existed
 * (`lanterniteNestOwnerUnitId`, `lanternPatrolFarWorld`, ...), so old and new checkpoints are interchangeable.
 */
function lanterniteStateToJSON(state: UnitLanterniteState): Record<string, unknown> {
    return {
        ...(state.nestOwnerUnitId != null ? { lanterniteNestOwnerUnitId: state.nestOwnerUnitId } : {}),
        ...(state.patrolFarWorld != null ? { lanternPatrolFarWorld: { ...state.patrolFarWorld } } : {}),
        ...(state.patrolLeg !== 'toFar' ? { lanternPatrolLeg: state.patrolLeg } : {}),
        ...(state.nestConfig != null
            ? { lanterniteNestConfig: JSON.parse(JSON.stringify(state.nestConfig)) as LanterniteNestMissionConfig }
            : {}),
        ...(state.nestSpawnState != null
            ? {
                  lanterniteNestSpawnState: {
                      spawnedIds: [...state.nestSpawnState.spawnedIds],
                      nextSpawnAtGameTime: state.nestSpawnState.nextSpawnAtGameTime,
                  },
              }
            : {}),
        ...(state.role != null ? { lanterniteRole: state.role } : {}),
        ...(state.targetNestPoiId != null ? { lanterniteTargetNestPoiId: state.targetNestPoiId } : {}),
        ...(state.homeNestPoiId != null ? { lanterniteHomeNestPoiId: state.homeNestPoiId } : {}),
        ...(state.constructionCompleteAtGameTime != null
            ? { lanterniteConstructionCompleteAtGameTime: state.constructionCompleteAtGameTime }
            : {}),
        ...(state.attackReadyAtGameTime !== 0 ? { lanterniteAttackReadyAtGameTime: state.attackReadyAtGameTime } : {}),
        ...(state.constructionAngle != null ? { lanterniteConstructionAngle: state.constructionAngle } : {}),
    };
}

function applyLanterniteStateFromJSON(state: UnitLanterniteState, data: Record<string, unknown>): void {
    if (data.lanterniteNestOwnerUnitId != null) {
        state.nestOwnerUnitId = data.lanterniteNestOwnerUnitId as string;
    }
    if (data.lanternPatrolFarWorld != null) {
        const w = data.lanternPatrolFarWorld as { x?: number; y?: number };
        if (typeof w.x === 'number' && typeof w.y === 'number') {
            state.patrolFarWorld = { x: w.x, y: w.y };
        }
    }
    if (data.lanternPatrolLeg === 'toNest' || data.lanternPatrolLeg === 'toFar') {
        state.patrolLeg = data.lanternPatrolLeg;
    }
    if (data.lanterniteNestConfig != null) {
        state.nestConfig = data.lanterniteNestConfig as LanterniteNestMissionConfig;
    }
    if (data.lanterniteNestSpawnState != null) {
        const s = data.lanterniteNestSpawnState as { spawnedIds?: unknown; nextSpawnAtGameTime?: number };
        const ids = Array.isArray(s.spawnedIds)
            ? (s.spawnedIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
        if (typeof s.nextSpawnAtGameTime === 'number') {
            state.nestSpawnState = { spawnedIds: ids, nextSpawnAtGameTime: s.nextSpawnAtGameTime };
        }
    }
    if (data.lanterniteRole === 'scout' || data.lanterniteRole === 'defender') {
        state.role = data.lanterniteRole;
    }
    if (typeof data.lanterniteTargetNestPoiId === 'string') {
        state.targetNestPoiId = data.lanterniteTargetNestPoiId;
    }
    if (typeof data.lanterniteHomeNestPoiId === 'string') {
        state.homeNestPoiId = data.lanterniteHomeNestPoiId;
    }
    if (typeof data.lanterniteConstructionCompleteAtGameTime === 'number') {
        state.constructionCompleteAtGameTime = data.lanterniteConstructionCompleteAtGameTime;
    }
    if (typeof data.lanterniteAttackReadyAtGameTime === 'number') {
        state.attackReadyAtGameTime = data.lanterniteAttackReadyAtGameTime;
    }
    if (typeof data.lanterniteConstructionAngle === 'number') {
        state.constructionAngle = data.lanterniteConstructionAngle;
    }
}

export const LANTERNITE_COMPONENT = defineUnitComponent<UnitLanterniteState, LanterniteComponentOptions>({
    id: 'lanternite',
    create: () => createLanterniteState(),
    toJSON: lanterniteStateToJSON,
    fromJSON: applyLanterniteStateFromJSON,
});

/** Lanternite state for `unit`, attaching a default slice if the unit does not carry one. Use for writes and the unit's own AI. */
export function lanterniteStateOf(unit: Unit): UnitLanterniteState {
    return getComponentState(unit, LANTERNITE_COMPONENT);
}

/** Lanternite state if the unit carries it. Use in scans over many units. */
export function peekLanterniteState(unit: Unit): UnitLanterniteState | undefined {
    return findComponentState(unit, LANTERNITE_COMPONENT);
}

/** Declared role (`creature` or `nest`); undefined when the unit's def does not declare the component. */
export function lanterniteRoleOf(unit: Unit): LanterniteComponentOptions['role'] | undefined {
    return getComponentOptions(unit, LANTERNITE_COMPONENT)?.role;
}

/** True for a unit whose def declares the lanternite component with the `nest` role. */
export function isLanterniteNest(unit: Unit): boolean {
    return lanterniteRoleOf(unit) === 'nest';
}

/** True for a unit whose def declares the lanternite component with the `creature` role. */
export function isLanterniteCreature(unit: Unit): boolean {
    return lanterniteRoleOf(unit) === 'creature';
}
